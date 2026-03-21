/**
 * xPipeWeb v2 — 체험 도구 클라이언트 (Vanilla JS, 외부 의존 없음)
 *
 * R1: 테이블 상태 컬럼에 파이프라인 뱃지 표시
 * R2: 뱃지 클릭 → 하단에 해당 스테이지 입출력만 표시
 * R3: 모델 선택/변경/표시
 * R4: stub 값 정리 (confidence/비용/품질 → "-")
 * R5: 이벤트/감사로그를 테이블 행에 표시
 * R6: 하단 패널에서 파이프라인 탭/이벤트 탭/감사로그 탭 제거
 * R7: [stub] 시뮬레이션 텍스트 완전 제거
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 상태
  // ---------------------------------------------------------------------------
  let documents = [];
  let selectedDocId = null;
  let currentFilter = 'all';
  let eventSource = null;
  let eventCount = 0;
  let pollTimer = null;
  let sseEventBuffer = [];  // 문서별 이벤트 추적

  // 정렬 상태
  let sortColumn = 'created_at'; // 기본 정렬: 업로드 시간
  let sortDirection = 'asc';     // 기본: 오름차순 (첫 번째 업로드가 맨 위)

  // 감사로그 건수 캐시 (doc_id -> count)
  let auditCountCache = {};

  // 현재 하단 패널에 표시 중인 뷰 종류
  // 'stage' | 'events' | 'audit' | 'text' | null
  let detailView = null;
  let detailViewParam = null; // 스테이지 이름 등

  // 모달 상태
  let modalDocId = null;

  // ---------------------------------------------------------------------------
  // DOM 참조
  // ---------------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    sseStatus: $('#sse-status'),
    sseLabel: $('#sse-label'),
    configSummary: $('#config-summary'),
    configPanel: $('#config-panel'),
    configToggle: $('#config-toggle'),
    configDisplay: $('#config-display'),
    dropzone: $('#dropzone'),
    fileInput: $('#file-input'),
    uploadArea: $('#upload-area'),
    filterBar: $('#filter-bar'),
    tableSection: $('#table-section'),
    docTbody: $('#doc-tbody'),
    emptyState: $('#empty-state'),
    benchmarkModal: $('#benchmark-modal'),
    benchmarkBody: $('#benchmark-body'),
    docModal: $('#doc-modal'),
    docModalTitle: $('#doc-modal-title'),
    docModalBody: $('#doc-modal-body'),
    ftCompleted: $('#ft-completed'),
    ftTotal: $('#ft-total'),
    ftEvents: $('#ft-events'),
    ftCost: $('#ft-cost'),
    ftVersion: $('#ft-version'),
    ftQueue: $('#ft-queue'),
  };

  // ---------------------------------------------------------------------------
  // API 호출
  // ---------------------------------------------------------------------------
  async function api(method, path, body) {
    const opts = { method };
    if (body instanceof FormData) {
      opts.body = body;
    } else if (body) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // 설정 (R3: 모델 드롭다운)
  // ---------------------------------------------------------------------------
  function initConfig() {
    dom.configSummary.addEventListener('click', () => {
      const panel = dom.configPanel;
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : '';
      dom.configToggle.classList.toggle('open', !isOpen);
    });

    $('#cfg-apply').addEventListener('click', async () => {
      try {
        // 활성 스테이지 수집
        const enabledStages = [];
        $$('.stage-toggle').forEach(el => {
          if (el.classList.contains('active')) enabledStages.push(el.dataset.stage);
        });
        // fixed 스테이지도 포함
        $$('.stage-toggle.fixed').forEach(el => {
          const name = el.dataset.stage;
          if (!enabledStages.includes(name)) enabledStages.push(name);
        });

        const payload = {
          mode: $('#cfg-mode').value,
          enabled_stages: enabledStages,
          models: {
            llm: $('#cfg-llm').value,
            ocr: $('#cfg-ocr').value,
            embedding: $('#cfg-embedding').value,
          },
        };
        // API 키: 값이 입력된 경우에만 전송 (빈 값이면 기존 유지)
        const openaiKey = $('#cfg-openai-key').value.trim();
        const upstageKey = $('#cfg-upstage-key').value.trim();
        if (openaiKey || upstageKey) {
          payload.api_keys = {};
          if (openaiKey) payload.api_keys.openai = openaiKey;
          if (upstageKey) payload.api_keys.upstage = upstageKey;
          $('#cfg-openai-key').value = '';
          $('#cfg-upstage-key').value = '';
        }
        // 저장 경로 (항상 전송 — 빈 값이면 임시 디렉토리로 복원)
        const storagePathEl = $('#cfg-storage-path');
        if (storagePathEl) {
          payload.storage_path = storagePathEl.value.trim();
        }
        const data = await api('PUT', '/api/config', payload);
        updateConfigDisplay(data.config);
        api('GET', '/api/config').then(d => {
          _updateKeyStatus(d.config.api_keys_status);
          _updateStorageDisplay(d.storage);
        }).catch(() => {});
        dom.configPanel.style.display = 'none';
        dom.configToggle.classList.remove('open');
      } catch (e) {
        alert('설정 변경 실패: ' + e.message);
      }
    });

    // 초기 설정 로드
    api('GET', '/api/config').then(data => {
      updateConfigDisplay(data.config);
      $('#cfg-mode').value = data.config.mode;

      // 스테이지 토글 렌더링
      if (data.stage_meta) {
        _renderStageToggles(data.stage_meta, data.config.enabled_stages || []);
      }

      // 모델 드롭다운 업데이트
      if (data.available_models) {
        _populateModelSelect('#cfg-llm', data.available_models.llm, data.config.models.llm);
        _populateModelSelect('#cfg-ocr', data.available_models.ocr, data.config.models.ocr);
        _populateModelSelect('#cfg-embedding', data.available_models.embedding, data.config.models.embedding);
      }

      // API 키 상태 표시
      _updateKeyStatus(data.config.api_keys_status);

      // 저장 경로 표시
      if (data.storage) {
        _updateStorageDisplay(data.storage);
      }
    }).catch(() => {});
  }

  // --- 스테이지 토글 ---
  let _stageMeta = [];

  const STAGE_TOGGLE_LABELS = {
    ingest: '업로드', convert: 'PDF변환', extract: '텍스트추출',
    classify: 'AI분류', detect_special: '감지', embed: '임베딩', complete: '완료'
  };

  function _renderStageToggles(meta, enabledStages) {
    _stageMeta = meta;
    const container = $('#stage-toggles');
    if (!container) return;
    container.innerHTML = '';

    meta.forEach(s => {
      const isEnabled = enabledStages.includes(s.name);
      const label = STAGE_TOGGLE_LABELS[s.name] || s.name;
      const btn = document.createElement('span');
      btn.className = 'stage-toggle' + (isEnabled ? ' active' : '') + (s.fixed ? ' fixed' : '');
      btn.dataset.stage = s.name;
      btn.textContent = label;
      if (s.skip_if) {
        btn.classList.add('conditional');
        btn.title = '조건부 실행: ' + s.skip_if;
      }
      if (s.fixed) {
        btn.title = '항상 실행 (변경 불가)';
      }

      if (!s.fixed) {
        btn.addEventListener('click', () => _toggleStage(s.name));
      }

      container.appendChild(btn);

      // 화살표 (마지막 제외)
      if (s !== meta[meta.length - 1]) {
        const arrow = document.createElement('span');
        arrow.className = 'stage-arrow';
        arrow.textContent = '→';
        container.appendChild(arrow);
      }
    });
  }

  function _toggleStage(name) {
    const btn = $(`.stage-toggle[data-stage="${name}"]`);
    if (!btn || btn.classList.contains('fixed')) return;

    const turningOn = !btn.classList.contains('active');

    if (turningOn) {
      // 켤 때: 의존하는 스테이지도 켜기
      _activateWithDeps(name);
    } else {
      // 끌 때: 이 스테이지에 의존하는 스테이지도 끄기
      _deactivateWithDependents(name);
    }
  }

  function _activateWithDeps(name) {
    const meta = _stageMeta.find(s => s.name === name);
    if (!meta) return;
    // 먼저 의존성 켜기 (재귀)
    (meta.requires || []).forEach(dep => {
      const depBtn = $(`.stage-toggle[data-stage="${dep}"]`);
      if (depBtn && !depBtn.classList.contains('active') && !depBtn.classList.contains('fixed')) {
        _activateWithDeps(dep);
      }
    });
    // 자신 켜기
    const btn = $(`.stage-toggle[data-stage="${name}"]`);
    if (btn) btn.classList.add('active');
  }

  function _deactivateWithDependents(name) {
    // 자신 끄기
    const btn = $(`.stage-toggle[data-stage="${name}"]`);
    if (btn) btn.classList.remove('active');
    // 이 스테이지에 의존하는 스테이지도 끄기 (재귀)
    _stageMeta.forEach(s => {
      if ((s.requires || []).includes(name)) {
        const depBtn = $(`.stage-toggle[data-stage="${s.name}"]`);
        if (depBtn && depBtn.classList.contains('active') && !depBtn.classList.contains('fixed')) {
          _deactivateWithDependents(s.name);
        }
      }
    });
  }

  function _updateKeyStatus(keysStatus) {
    if (!keysStatus) return;
    _renderKeyBadge('#key-status-openai', keysStatus.openai);
    _renderKeyBadge('#key-status-upstage', keysStatus.upstage);
  }

  function _updateStorageDisplay(storage) {
    if (!storage) return;
    const pathInput = $('#cfg-storage-path');
    const activeLabel = $('#storage-active-path');
    if (pathInput) {
      pathInput.value = storage.storage_path || '';
    }
    if (activeLabel) {
      if (storage.is_temporary) {
        activeLabel.textContent = '임시: ' + (storage.active_path || '-') + ' (서버 종료 시 삭제)';
        activeLabel.className = 'storage-active-path temporary';
      } else {
        activeLabel.textContent = '사용 중: ' + (storage.active_path || '-');
        activeLabel.className = 'storage-active-path persistent';
      }
    }
  }

  function _renderKeyBadge(selector, info) {
    const el = $(selector);
    if (!el || !info) return;
    if (!info.set) {
      el.textContent = '미설정';
      el.className = 'key-status key-none';
    } else {
      const srcLabel = info.source === 'config' ? '설정' : '환경변수';
      el.textContent = info.masked + ' (' + srcLabel + ')';
      el.className = 'key-status key-set';
    }
  }

  function _populateModelSelect(selector, options, current) {
    const select = $(selector);
    select.innerHTML = '';
    (options || []).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    select.value = current;
  }

  function updateConfigDisplay(cfg) {
    const modeLabel = { stub: '시뮬레이션', real: '실제 실행' }[cfg.mode] || cfg.mode;
    const modelsStr = cfg.models
      ? cfg.models.llm + ' / ' + cfg.models.ocr + ' / ' + cfg.models.embedding
      : '';

    // 스테이지 뱃지 생성
    const enabled = cfg.enabled_stages || [];
    const allStages = ['ingest', 'convert', 'extract', 'classify', 'detect_special', 'embed', 'complete'];
    let stageHtml = '';
    allStages.forEach((name, i) => {
      const isOn = enabled.includes(name);
      const label = STAGE_TOGGLE_LABELS[name] || name;
      const cls = isOn ? 'summary-stage on' : 'summary-stage off';
      stageHtml += '<span class="' + cls + '">' + label + '</span>';
      if (i < allStages.length - 1) stageHtml += '<span class="summary-arrow">→</span>';
    });

    // 저장 경로 요약
    const storagePath = cfg.storage_path || '';
    let storageLabel = '';
    if (storagePath) {
      // 경로가 길면 마지막 디렉토리명만 표시
      const parts = storagePath.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
      const shortPath = parts.length > 2 ? '.../' + parts.slice(-2).join('/') : storagePath;
      storageLabel = '<span class="summary-sep">|</span><span class="summary-text summary-storage" title="' + escapeHtml(storagePath) + '">' + escapeHtml(shortPath) + '</span>';
    } else {
      storageLabel = '<span class="summary-sep">|</span><span class="summary-text summary-storage-temp">임시 저장</span>';
    }

    dom.configDisplay.innerHTML = stageHtml +
      '<span class="summary-sep">|</span>' +
      '<span class="summary-text">' + modeLabel + '</span>' +
      (modelsStr ? '<span class="summary-sep">|</span><span class="summary-text">' + modelsStr + '</span>' : '') +
      storageLabel;
    const ver = document.getElementById('version')?.textContent || 'v0.2.4';
    dom.ftVersion.textContent = 'xPipeWeb ' + ver + ' / ' + modeLabel;
  }

  // ---------------------------------------------------------------------------
  // 파일 업로드
  // ---------------------------------------------------------------------------
  function initUpload() {
    const dz = dom.dropzone;
    const fi = dom.fileInput;

    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
    fi.addEventListener('change', () => {
      handleFiles(fi.files);
      fi.value = '';
    });
  }

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    dom.dropzone.classList.add('compact');

    if (fileList.length === 1) {
      const fd = new FormData();
      fd.append('file', fileList[0]);
      try {
        await api('POST', '/api/upload', fd);
      } catch (e) {
        alert('업로드 실패: ' + e.message);
      }
    } else {
      const fd = new FormData();
      for (const f of fileList) fd.append('files', f);
      try {
        await api('POST', '/api/upload/batch', fd);
      } catch (e) {
        alert('배치 업로드 실패: ' + e.message);
      }
    }

    await refreshDocuments();
  }

  // ---------------------------------------------------------------------------
  // 문서 목록 갱신
  // ---------------------------------------------------------------------------
  async function refreshDocuments() {
    try {
      const data = await api('GET', '/api/documents');
      documents = data.documents || [];

      // compact 복원: 문서 0건이면 업로드 영역 원래 크기로
      if (documents.length === 0) {
        dom.dropzone.classList.remove('compact');
      }

      renderTable();
      updateFooter();
      updateFilters();

      if (selectedDocId) {
        const doc = documents.find(d => d.id === selectedDocId);
        if (doc) {
          // 현재 표시 중인 뷰 갱신
          _refreshDetailView(doc);
        } else {
          // 서버 재시작 등으로 문서가 사라진 경우
          _closeAccordion();
        }
      }
    } catch (e) {
      console.error('문서 목록 갱신 실패:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // 테이블 렌더링
  // ---------------------------------------------------------------------------

  // 스테이지 이름 한글 매핑
  const STAGE_LABELS = {
    ingest: '업로드', convert: 'PDF변환', extract: '텍스트추출',
    classify: 'AI분류', detect_special: '감지', embed: '임베딩', complete: '완료'
  };

  // 스테이지별 기하 도형 아이콘 (10x10 SVG)
  const STAGE_ICONS = {
    ingest: '<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,8.5 1,2.5 9,2.5" fill="currentColor"/></svg>',
    convert: '<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,1 9,5 5,9 1,5" fill="currentColor"/></svg>',
    extract: '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="2.5" width="8" height="5" rx="1" fill="currentColor"/></svg>',
    classify: '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1.5" fill="currentColor"/></svg>',
    detect_special: '<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,1.5 9,7.5 1,7.5" fill="currentColor"/></svg>',
    embed: '<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,0.5 9,2.75 9,7.25 5,9.5 1,7.25 1,2.75" fill="currentColor"/></svg>',
    complete: '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>',
  };

  // 상태 한글 매핑 (도트 툴팁용)
  const STATUS_LABELS = {
    pending: '대기', running: '처리중', completed: '완료', error: '에러'
  };

  // 정렬 칼럼 정의 (헤더 인덱스 -> 정렬 키)
  const SORTABLE_COLUMNS = {
    0: { key: 'queue_number', label: '#' },
    1: { key: 'proc_type', label: '유형' },
    2: { key: 'filename', label: '파일명' },
    3: { key: 'file_size', label: '크기' },
    4: { key: 'file_ext', label: '타입' },
    5: { key: 'created_at', label: '업로드' },
    6: { key: 'status', label: '상태' },
    7: { key: 'doc_type', label: '분류' },
    9: { key: 'cost', label: '비용' },
    10: { key: 'duration', label: '소요' },
  };

  /**
   * 정렬 키에 해당하는 값을 문서에서 추출
   */
  function _getSortValue(doc, key) {
    switch (key) {
      case 'queue_number': return doc.queue_number || 0;
      case 'filename': return (doc.result && doc.result.display_name) || doc.filename || '';
      case 'file_size': return doc.file_size || 0;
      case 'file_ext': return getFileExt(doc.filename);
      case 'proc_type': return getProcessingType(getFileExt(doc.filename));
      case 'created_at': return doc.created_at || 0;
      case 'status': return doc.status || '';
      case 'doc_type': return (doc.result && doc.result.document_type) || '';
      case 'cost': return doc.cost || 0;
      case 'duration': return doc.duration || 0;
      default: return '';
    }
  }

  /**
   * 문서 배열을 현재 정렬 상태로 정렬
   */
  function sortDocuments(docs) {
    return docs.slice().sort((a, b) => {
      let va = _getSortValue(a, sortColumn);
      let vb = _getSortValue(b, sortColumn);
      // 문자열 비교
      if (typeof va === 'string' && typeof vb === 'string') {
        va = va.toLowerCase();
        vb = vb.toLowerCase();
        if (va < vb) return sortDirection === 'asc' ? -1 : 1;
        if (va > vb) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }
      // 숫자 비교
      if (sortDirection === 'asc') return (va || 0) - (vb || 0);
      return (vb || 0) - (va || 0);
    });
  }

  function renderTable() {
    const filteredUnsorted = currentFilter === 'all'
      ? documents
      : documents.filter(d => d.status === currentFilter);
    const filtered = sortDocuments(filteredUnsorted);

    if (documents.length === 0) {
      dom.emptyState.style.display = '';
      dom.filterBar.style.display = 'none';
      dom.tableSection.style.display = 'none';
      _closeAccordion();
      return;
    }

    // 아코디언 상태 기억 (innerHTML 교체 시 소멸되므로)
    const savedAccordion = selectedDocId && detailView ? {
      docId: selectedDocId,
      view: detailView,
      param: detailViewParam,
    } : null;

    dom.emptyState.style.display = 'none';
    dom.filterBar.style.display = '';
    dom.tableSection.style.display = '';

    dom.docTbody.innerHTML = filtered.map(doc => {
      const ext = getFileExt(doc.filename);
      const procBadge = renderProcessingBadge(ext);
      const displayName = (doc.result && doc.result.display_name && doc.result.display_name !== doc.filename)
        ? '<span class="fname-display">' + escapeHtml(truncate(doc.result.display_name, 32)) + '</span><span class="fname-orig">' + escapeHtml(truncate(doc.filename, 28)) + '</span>'
        : escapeHtml(truncate(doc.filename, 32));
      const sizeHtml = formatSize(doc.file_size);
      const typeHtml = ext ? ext.toUpperCase() : '-';
      const uploadHtml = formatDate(doc.created_at);
      const statusHtml = renderStatusCell(doc);
      const classifyRan = (doc.enabled_stages || []).includes('classify');
      const classifyHtml = !classifyRan ? '<span class="text-muted">-</span>'
        : doc.result ? escapeHtml(doc.result.document_type) : '<span class="text-muted">-</span>';
      const detectHtml = renderDetections(doc);
      const costHtml = renderCost(doc);
      const durationHtml = doc.duration ? doc.duration.toFixed(2) + 's' : '<span class="text-muted">-</span>';
      const eventsHtml = renderEventsBadge(doc);
      const auditHtml = renderAuditBadge(doc);
      const actionsHtml = renderActions(doc);
      const rowClass = 'row-' + doc.status;
      const selClass = doc.id === selectedDocId ? 'accordion-open' : '';

      const chevron = doc.id === selectedDocId ? '▼' : '▶';
      const queueNum = doc.queue_number ? '<span class="queue-number">#' + doc.queue_number + '</span>' : '';
      return '<tr class="' + rowClass + ' ' + selClass + '" data-id="' + doc.id + '">' +
        '<td class="td-toggle">' + queueNum + '<button type="button" class="btn-accordion-toggle" title="상세 보기">' + chevron + '</button></td>' +
        '<td>' + procBadge + '</td>' +
        '<td class="td-filename td-clickable" data-action="preview" data-id="' + doc.id + '">' + displayName + '</td>' +
        '<td class="td-compact">' + sizeHtml + '</td>' +
        '<td class="td-compact">' + typeHtml + '</td>' +
        '<td class="td-compact">' + uploadHtml + '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td>' + classifyHtml + '</td>' +
        '<td>' + detectHtml + '</td>' +
        '<td>' + costHtml + '</td>' +
        '<td>' + durationHtml + '</td>' +
        '<td>' + eventsHtml + '</td>' +
        '<td>' + auditHtml + '</td>' +
        '<td>' + actionsHtml + '</td>' +
        '</tr>';
    }).join('');

    // 행 클릭 이벤트 — 아코디언 토글
    dom.docTbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button') && !e.target.closest('.btn-accordion-toggle')) return;
        if (e.target.closest('.inline-stage')) return;
        if (e.target.closest('.badge-events')) return;
        if (e.target.closest('.badge-audit')) return;
        // 파일명 클릭 → 프리뷰 모달
        if (e.target.closest('.td-clickable[data-action="preview"]')) {
          const id = e.target.closest('.td-clickable').dataset.id;
          const doc = documents.find(d => d.id === id);
          if (doc) openDocModal(doc, 'preview');
          return;
        }

        const id = tr.dataset.id;
        const doc = documents.find(d => d.id === id);
        if (doc) {
          // completed일 때만 AI 요약, 그 외는 텍스트 뷰
          const view = doc.status === 'completed' ? 'summary' : 'text';
          showDetailView(doc, view);
        }
      });
    });

    // 인라인 파이프라인 뱃지 클릭 → 해당 스테이지 상세
    dom.docTbody.querySelectorAll('.inline-stage').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = badge.closest('tr');
        const id = tr.dataset.id;
        const doc = documents.find(d => d.id === id);
        const stageName = badge.dataset.stage;
        if (doc && stageName) {
          showDetailView(doc, 'stage', stageName);
        }
      });
    });

    // 이벤트 뱃지 클릭
    dom.docTbody.querySelectorAll('.badge-events').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = badge.closest('tr');
        const id = tr.dataset.id;
        const doc = documents.find(d => d.id === id);
        if (doc) {
          showDetailView(doc, 'events');
        }
      });
    });

    // 감사로그 뱃지 클릭
    dom.docTbody.querySelectorAll('.badge-audit').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const tr = badge.closest('tr');
        const id = tr.dataset.id;
        const doc = documents.find(d => d.id === id);
        if (doc) {
          showDetailView(doc, 'audit');
        }
      });
    });

    // 요약/텍스트 버튼 → 모달
    dom.docTbody.querySelectorAll('.btn-summary').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const doc = documents.find(d => d.id === btn.dataset.id);
        if (doc) openDocModal(doc, 'summary');
      });
    });

    dom.docTbody.querySelectorAll('.btn-fulltext').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const doc = documents.find(d => d.id === btn.dataset.id);
        if (doc) openDocModal(doc, 'text');
      });
    });

    // 재시도/제거 버튼
    dom.docTbody.querySelectorAll('.btn-retry').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api('POST', '/api/retry/' + btn.dataset.id);
          await refreshDocuments();
        } catch (err) {
          alert('재시도 실패: ' + err.message);
        }
      });
    });

    dom.docTbody.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          await api('DELETE', '/api/documents/' + id);
          if (selectedDocId === id) {
            _closeAccordion();
          }
          await refreshDocuments();
        } catch (err) {
          alert('제거 실패: ' + err.message);
        }
      });
    });

    // 아코디언 복원: renderTable()로 innerHTML이 교체된 후 다시 열기
    if (savedAccordion) {
      const doc = documents.find(d => d.id === savedAccordion.docId);
      if (doc) {
        // 상태를 초기화한 뒤 다시 열기 (토글 방지)
        selectedDocId = null;
        detailView = null;
        detailViewParam = null;
        showDetailView(doc, savedAccordion.view, savedAccordion.param);
      }
    }
  }

  function renderStatusCell(doc) {
    if (doc.status === 'queued') {
      // 대기 순서/총 대기 수 계산
      const queuedDocs = documents.filter(d => d.status === 'queued');
      const sortedQueued = queuedDocs.slice().sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0));
      const position = sortedQueued.findIndex(d => d.id === doc.id) + 1;
      const total = queuedDocs.length;
      const posHtml = total > 0 ? '<span class="queue-position">' + position + '/' + total + '</span>' : '';
      return '<span class="status-text queued">대기</span>' + posHtml;
    }

    if (doc.status === 'error') {
      // 에러 시에도 도트 표시 (어느 스테이지에서 에러인지 시각적으로)
      const stagesDetail = doc.stages_detail || {};
      const stageOrder = Object.keys(stagesDetail);
      if (stageOrder.length > 0) {
        return _renderDotPipeline(doc, stagesDetail, stageOrder);
      }
      return '<span class="status-text error">에러</span>';
    }

    // 완료 또는 처리중: 도트 아이콘 표시
    const stagesDetail = doc.stages_detail || {};
    const stageOrder = Object.keys(stagesDetail);

    if (stageOrder.length > 0) {
      return _renderDotPipeline(doc, stagesDetail, stageOrder);
    }

    if (doc.status === 'completed') {
      return '<span class="status-text completed">완료</span>';
    }

    if (doc.status === 'processing') {
      return '<span class="status-text processing">처리중</span>';
    }

    // fallback
    return '<span class="status-text">' + escapeHtml(doc.status) + '</span>';
  }

  /**
   * 파이프라인 상태를 도트 아이콘으로 렌더링
   */
  function _renderDotPipeline(doc, stagesDetail, stageOrder) {
    let html = '<div class="inline-pipeline">';
    const skipped = (doc.result && doc.result.stages_skipped) || [];
    let prevShown = false;
    for (let i = 0; i < stageOrder.length; i++) {
      const name = stageOrder[i];
      if (skipped.includes(name)) continue;
      const detail = stagesDetail[name] || {};
      let cls = 'pending';
      if (detail.status === 'completed') cls = 'done';
      else if (detail.status === 'running') cls = 'running';
      else if (detail.status === 'error') cls = 'error';
      const label = STAGE_LABELS[name] || name;
      if (prevShown) {
        html += '<span class="inline-arrow">\u2192</span>';
      }
      html += '<span class="inline-stage ' + cls + '" data-stage="' + name + '">' + label + '</span>';
      prevShown = true;
    }
    html += '</div>';
    return html;
  }

  function renderDetections(doc) {
    if (!doc.result || !doc.result.detections || doc.result.detections.length === 0) {
      return '<span class="text-muted">-</span>';
    }
    return doc.result.detections.map(d => escapeHtml(d.doc_type || d)).join(', ');
  }

  function renderCost(doc) {
    if (doc.cost === null || doc.cost === undefined) {
      return '<span class="text-muted has-tooltip" data-tip="시뮬레이션 모드에서는 비용이 발생하지 않습니다">-</span>';
    }
    // 매우 작은 비용은 소수점 4자리까지
    if (doc.cost < 0.001) {
      return '$' + doc.cost.toFixed(4);
    }
    return '$' + doc.cost.toFixed(3);
  }

  // R5: 이벤트 건수 뱃지
  function renderEventsBadge(doc) {
    const docEvents = sseEventBuffer.filter(e => e.document_id === doc.id);
    if (docEvents.length === 0) return '<span class="text-muted">-</span>';
    return '<span class="badge badge-events badge-count">' + docEvents.length + '건</span>';
  }

  // R5: 감사로그 건수 뱃지 (서버에서 실제 건수 제공)
  function renderAuditBadge(doc) {
    const count = doc.audit_count || 0;
    if (count === 0) return '<span class="text-muted">-</span>';
    return '<span class="badge badge-audit badge-count">' + count + '건</span>';
  }

  function renderActions(doc) {
    let html = '<div class="action-btns">';
    if (doc.status === 'completed') {
      html += '<button class="btn-icon btn-summary has-tooltip" data-id="' + doc.id + '" data-tip="AI 요약">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z"/></svg></button>';
      html += '<button class="btn-icon btn-fulltext has-tooltip" data-id="' + doc.id + '" data-tip="전체 텍스트">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></button>';
    }
    if (doc.status === 'error') {
      html += '<button class="btn-icon btn-retry has-tooltip" data-id="' + doc.id + '" data-tip="재시도">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>';
    }
    const isProcessing = doc.status === 'queued' || doc.status === 'processing';
    html += '<button class="btn-icon btn-remove has-tooltip" data-id="' + doc.id + '" data-tip="제거"' +
      (isProcessing ? ' disabled' : '') + '>' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------------------------
  // 필터
  // ---------------------------------------------------------------------------
  function initFilters() {
    dom.filterBar.addEventListener('click', (e) => {
      const item = e.target.closest('.filter-item');
      if (!item) return;
      currentFilter = item.dataset.filter;
      $$('.filter-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      renderTable();
    });

    // 전체 초기화 버튼
    const resetBtn = $('#btn-reset-all');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (!confirm('모든 문서를 삭제하시겠습니까?')) return;
        try {
          await api('DELETE', '/api/documents');
          _closeAccordion();
          await refreshDocuments();
        } catch (err) {
          alert('전체 초기화 실패: ' + err.message);
        }
      });
    }
  }

  function updateFilters() {
    const counts = { all: 0, queued: 0, processing: 0, completed: 0, error: 0 };
    documents.forEach(d => {
      counts.all++;
      if (counts[d.status] !== undefined) counts[d.status]++;
    });
    Object.entries(counts).forEach(([key, val]) => {
      const el = $('#cnt-' + key);
      if (el) el.textContent = val;
    });
  }

  // ---------------------------------------------------------------------------
  // 하단 바
  // ---------------------------------------------------------------------------
  function updateFooter() {
    const completed = documents.filter(d => d.status === 'completed').length;
    dom.ftCompleted.textContent = completed;
    dom.ftTotal.textContent = documents.length;
    dom.ftEvents.textContent = eventCount;

    const totalCost = documents.reduce((s, d) => s + (d.cost || 0), 0);
    dom.ftCost.textContent = totalCost > 0 ? '$' + totalCost.toFixed(3) : '-';

    // 큐 상태 (처리중/대기)
    const processingCount = documents.filter(d => d.status === 'processing').length;
    const queuedCount = documents.filter(d => d.status === 'queued').length;
    if (dom.ftQueue) {
      if (processingCount > 0 || queuedCount > 0) {
        dom.ftQueue.textContent = processingCount + '건 처리중 / ' + queuedCount + '건 대기';
      } else {
        dom.ftQueue.textContent = '-';
      }
    }

    // 완료 문서 0건이면 벤치마크 버튼 비활성화
    const benchBtn = $('#btn-benchmark');
    if (benchBtn) {
      benchBtn.disabled = completed === 0;
    }
  }

  // ---------------------------------------------------------------------------
  // 아코디언 상세 뷰
  // ---------------------------------------------------------------------------
  function initDetail() {
    // 아코디언 방식이므로 별도 초기화 불필요
  }

  /**
   * 기존 아코디언 닫기
   */
  function _closeAccordion() {
    const existing = document.querySelector('.accordion-row');
    if (existing) {
      // 원래 행의 강조 제거
      const prevTr = existing.previousElementSibling;
      if (prevTr) prevTr.classList.remove('accordion-open');
      existing.remove();
    }
    selectedDocId = null;
    detailView = null;
    detailViewParam = null;
  }

  /**
   * 아코디언 행을 해당 tr 아래에 삽입하여 상세 뷰 표시
   * @param {object} doc - 문서 객체
   * @param {string} view - 'stage' | 'events' | 'audit' | 'summary' | 'text'
   * @param {string} [param] - 스테이지 이름 등
   */
  function showDetailView(doc, view, param) {
    // 같은 doc, 같은 view를 다시 클릭하면 토글(닫기)
    if (selectedDocId === doc.id && detailView === view && detailViewParam === (param || null)) {
      _closeAccordion();
      return;
    }

    // 기존 아코디언 닫기
    const existingRow = document.querySelector('.accordion-row');
    if (existingRow) {
      const prevTr = existingRow.previousElementSibling;
      if (prevTr) prevTr.classList.remove('accordion-open');
      existingRow.remove();
    }

    selectedDocId = doc.id;
    detailView = view;
    detailViewParam = param || null;

    // 해당 행 찾기
    const targetTr = dom.docTbody.querySelector('tr[data-id="' + doc.id + '"]');
    if (!targetTr) return;

    // 행 강조
    dom.docTbody.querySelectorAll('tr.selected').forEach(t => t.classList.remove('selected'));
    targetTr.classList.add('accordion-open');

    // 아코디언 행 생성
    const accTr = document.createElement('tr');
    accTr.className = 'accordion-row';

    // 탭 버튼 (요약/텍스트) — completed 상태에서만 탭 표시
    let tabsHtml = '';
    if (doc.status === 'completed' && (view === 'summary' || view === 'text')) {
      tabsHtml =
        '<button type="button" class="btn-xs accordion-tab' + (view === 'summary' ? ' active' : '') + '" data-view="summary">요약</button>' +
        '<button type="button" class="btn-xs accordion-tab' + (view === 'text' ? ' active' : '') + '" data-view="text">전체 텍스트</button>';
    }

    accTr.innerHTML =
      '<td colspan="14">' +
      '<div class="accordion-content">' +
      '<div class="accordion-header">' +
      '<h3>' + escapeHtml(doc.filename) + '</h3>' +
      '<div class="accordion-header-actions">' +
      tabsHtml +
      '<button type="button" class="btn-close accordion-close">&times;</button>' +
      '</div></div>' +
      '<div class="detail-content"></div>' +
      '</div></td>';

    // 행 바로 뒤에 삽입
    targetTr.after(accTr);

    // 닫기 버튼 이벤트
    accTr.querySelector('.accordion-close').addEventListener('click', (e) => {
      e.stopPropagation();
      _closeAccordion();
    });

    // 탭 전환 이벤트
    accTr.querySelectorAll('.accordion-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newView = btn.dataset.view;
        showDetailView(doc, newView);
      });
    });

    // 콘텐츠 렌더링
    _renderDetailContent(doc, view, param);
  }

  /**
   * 현재 표시 중인 뷰를 최신 데이터로 갱신
   */
  function _refreshDetailView(doc) {
    if (detailView) {
      _renderDetailContent(doc, detailView, detailViewParam);
    }
  }

  /**
   * 아코디언 내부의 detail-content 요소 얻기
   */
  function _getDetailContentEl() {
    const accRow = document.querySelector('.accordion-row');
    return accRow ? accRow.querySelector('.detail-content') : null;
  }

  /**
   * 상세 패널 콘텐츠 렌더링
   */
  function _renderDetailContent(doc, view, param) {
    if (view === 'summary') {
      renderSummaryView(doc);
    } else if (view === 'stage') {
      renderStageDetail(doc, param);
    } else if (view === 'events') {
      renderEventsView(doc.id);
    } else if (view === 'audit') {
      renderAuditView(doc.id);
    } else if (view === 'text') {
      loadExtractedText(doc.id);
    }
  }

  // ---------------------------------------------------------------------------
  // 요약 뷰
  // ---------------------------------------------------------------------------
  async function renderSummaryView(doc) {
    const el = _getDetailContentEl();
    if (!el) return;
    el.innerHTML = '<div class="ai-summary-loading"><div class="spinner"></div><p>AI 요약 생성 중...</p></div>';

    try {
      const data = await api('GET', '/api/summary/' + doc.id);

      if (data.simulation) {
        el.innerHTML = '<div class="ai-summary-view"><div class="ai-summary-sim">' +
          '<span class="text-muted">시뮬레이션 모드에서는 AI 요약을 제공하지 않습니다</span></div></div>';
        return;
      }

      const cached = data.cached ? ' <span class="text-muted">(캐시)</span>' : '';
      let html = '<div class="ai-summary-view">';
      html += '<div class="ai-summary-header">';
      html += '<span class="ai-summary-badge">AI 요약</span>' + cached;
      html += '</div>';
      html += '<div class="ai-summary-content">' + escapeHtml(data.summary || '') + '</div>';
      html += '</div>';

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<p class="text-error">AI 요약 실패: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ---------------------------------------------------------------------------
  // 스테이지 상세 (뱃지 클릭 시 해당 스테이지만)
  // ---------------------------------------------------------------------------
  async function renderStageDetail(doc, stageName) {
    const el = _getDetailContentEl();
    if (!el) return;
    el.innerHTML = '<p class="text-muted">로딩...</p>';

    let stagesData = {};
    try {
      const resp = await api('GET', '/api/stages/' + doc.id);
      stagesData = resp.stages_data || {};
    } catch (e) {
      // 아직 데이터 없을 수 있음
    }

    const stagesDetail = doc.stages_detail || {};
    const detail = stagesDetail[stageName] || {};
    const data = stagesData[stageName] || {};
    const status = detail.status || 'pending';
    const koreanName = STAGE_LABELS[stageName] || stageName;
    const englishName = _stageDisplayName(stageName);

    let html = '<div class="stage-detail-view">';
    html += '<div class="stage-detail-title">';
    html += '<span class="stage-detail-name">' + koreanName + '</span>';
    html += '<span class="stage-detail-eng">(' + englishName + ')</span>';
    const statusLabel = { pending: '대기', running: '처리중', completed: '완료', error: '에러' }[status] || status;
    const statusCls = { pending: 'pending', running: 'running', completed: 'done', error: 'error' }[status] || 'pending';
    html += '<span class="inline-stage ' + statusCls + '" style="margin-left:8px;">' + statusLabel + '</span>';
    html += '</div>';

    if (status === 'pending' || status === 'running') {
      html += '<p class="text-muted">' + (status === 'pending' ? '대기 중' : '처리 중...') + '</p>';
    } else if (!data || !data.input) {
      html += '<p class="text-muted">데이터 없음</p>';
    } else {
      // INPUT 섹션
      html += '<div class="io-section">';
      html += '<div class="io-label input">INPUT</div>';
      html += '<div class="io-grid">';
      html += _renderKVPairs(data.input);
      html += '</div></div>';

      // 화살표
      html += '<div class="io-arrow">&#8595;</div>';

      // OUTPUT 섹션
      html += '<div class="io-section">';
      html += '<div class="io-label output">OUTPUT</div>';
      html += '<div class="io-grid">';

      if (data.output) {
        const outputCopy = Object.assign({}, data.output);
        // full_text 미리보기 + 전체 보기 버튼
        if (outputCopy.full_text && outputCopy.full_text.length > 200) {
          const textLen = outputCopy.full_text.length;
          delete outputCopy.full_text;
          html += _renderKVPairs(outputCopy);
          html += '</div>';
          html += '<div class="stage-text-preview">';
          html += '<div class="io-label output">추출 텍스트 (' + textLen.toLocaleString() + '자)</div>';
          html += '<div class="text-content">' + escapeHtml(data.output.full_text.substring(0, 500)) + (textLen > 500 ? '...' : '') + '</div>';
          html += '</div>';
        } else {
          html += _renderKVPairs(outputCopy);
          html += '</div>';
        }
      } else {
        html += '<span class="text-muted">-</span>';
        html += '</div>';
      }

      html += '</div>';
    }

    // 에러 표시
    if (doc.status === 'error' && doc.error_stage === stageName && doc.error) {
      html += '<div class="error-msg">' +
        '<span>' + escapeHtml(doc.error) + '</span>' +
        '<button class="btn-xs btn-retry" data-id="' + doc.id + '">재시도</button>' +
        '</div>';
    }

    html += '</div>';
    el.innerHTML = html;

    // 재시도 버튼
    el.querySelectorAll('.btn-retry').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await api('POST', '/api/retry/' + btn.dataset.id);
          await refreshDocuments();
        } catch (err) {
          alert('재시도 실패: ' + err.message);
        }
      });
    });
  }

  function _stageDisplayName(name) {
    const names = {
      ingest: 'Ingest',
      convert: 'Convert',
      extract: 'Extract',
      classify: 'Classify',
      detect_special: 'DetectSpecial',
      embed: 'Embed',
      complete: 'Complete',
    };
    return names[name] || name;
  }

  function _renderKVPairs(obj) {
    let html = '';
    for (const [k, v] of Object.entries(obj)) {
      const displayKey = k;
      const displayVal = _displayVal(v);
      html += '<span class="io-key">' + escapeHtml(displayKey) + '</span>';
      html += '<span class="io-val">' + escapeHtml(displayVal) + '</span>';
    }
    return html;
  }

  function _displayVal(v) {
    if (v === null || v === undefined) return '-';
    if (v === '-') return '-';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return v.length > 0 ? JSON.stringify(v) : '-';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  // ---------------------------------------------------------------------------
  // 추출 텍스트 뷰
  // ---------------------------------------------------------------------------
  async function loadExtractedText(docId) {
    const el = _getDetailContentEl();
    if (!el) return;
    el.innerHTML = '<p class="text-muted">로딩...</p>';

    try {
      const data = await api('GET', '/api/text/' + docId);

      let html = '<div class="text-tab-header">';
      html += '<span class="text-tab-info">' + (data.text_length || 0) + '자</span>';
      html += '<div class="text-tab-actions">';
      html += '<button class="btn-xs" id="btn-copy-text">클립보드 복사</button>';
      html += '<button class="btn-xs" id="btn-download-text">TXT 다운로드</button>';
      html += '</div></div>';

      html += '<div class="text-content" id="extracted-text-content">' + escapeHtml(data.text || '(텍스트 없음)') + '</div>';

      el.innerHTML = html;

      // 복사 버튼
      const copyBtn = $('#btn-copy-text');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(data.text || '').then(() => {
            copyBtn.textContent = '복사 완료';
            setTimeout(() => { copyBtn.textContent = '클립보드 복사'; }, 1500);
          }).catch(() => {
            alert('클립보드 복사 실패');
          });
        });
      }

      // 다운로드 버튼
      const dlBtn = $('#btn-download-text');
      if (dlBtn) {
        dlBtn.addEventListener('click', () => {
          const blob = new Blob([data.text || ''], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const doc = documents.find(d => d.id === docId);
          const baseName = doc ? doc.filename.replace(/\.[^.]+$/, '') : docId;
          a.download = baseName + '_extracted.txt';
          a.click();
          URL.revokeObjectURL(url);
        });
      }
    } catch (err) {
      el.innerHTML = '<p class="text-error">텍스트 로드 실패: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ---------------------------------------------------------------------------
  // 이벤트 뷰 (하단 패널)
  // ---------------------------------------------------------------------------
  function renderEventsView(docId) {
    const el = _getDetailContentEl();
    if (!el) return;
    const docEvents = sseEventBuffer.filter(e => e.document_id === docId);

    if (docEvents.length === 0) {
      el.innerHTML = '<div class="detail-view-title">이벤트</div><p class="text-muted">이벤트가 없습니다.</p>';
      return;
    }

    let html = '<div class="detail-view-title">이벤트 (' + docEvents.length + '건)</div>';
    html += '<ul class="log-list">';
    for (const evt of docEvents) {
      html += '<li class="log-item">';
      html += '<span class="log-time">' + formatTime(evt.timestamp) + '</span>';
      html += '<span class="log-type">' + escapeHtml(evt.event_type || '') + '</span>';
      html += '<span class="log-msg">' + escapeHtml(evt.stage || '') + '</span>';
      html += '</li>';
    }
    html += '</ul>';
    el.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // 감사 로그 뷰 (하단 패널)
  // ---------------------------------------------------------------------------
  async function renderAuditView(docId) {
    const el = _getDetailContentEl();
    if (!el) return;
    el.innerHTML = '<div class="detail-view-title">감사로그</div><p class="text-muted">로딩...</p>';
    try {
      const data = await api('GET', '/api/audit/' + docId);
      if (!data.entries || data.entries.length === 0) {
        el.innerHTML = '<div class="detail-view-title">감사로그</div><p class="text-muted">감사 로그가 없습니다.</p>';
        return;
      }
      let html = '<div class="detail-view-title">감사로그 (' + data.entries.length + '건)</div>';
      html += '<ul class="log-list">';
      for (const e of data.entries) {
        html += '<li class="log-item">';
        html += '<span class="log-time">' + formatTime(e.timestamp) + '</span>';
        html += '<span class="log-type">' + escapeHtml(e.action) + '</span>';
        html += '<span class="log-msg">' + escapeHtml(e.stage) + ' / ' + escapeHtml(e.actor) + '</span>';
        html += '</li>';
      }
      html += '</ul>';
      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = '<div class="detail-view-title">감사로그</div><p class="text-error">로드 실패: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ---------------------------------------------------------------------------
  // 벤치마크 모달
  // ---------------------------------------------------------------------------
  function initBenchmark() {
    $('#btn-benchmark').addEventListener('click', showBenchmark);
    $('#benchmark-close').addEventListener('click', () => {
      dom.benchmarkModal.style.display = 'none';
    });
    dom.benchmarkModal.addEventListener('click', (e) => {
      if (e.target === dom.benchmarkModal) dom.benchmarkModal.style.display = 'none';
    });
    $('#benchmark-json').addEventListener('click', downloadBenchmarkJson);
    $('#benchmark-csv').addEventListener('click', downloadBenchmarkCsv);
  }

  async function showBenchmark() {
    dom.benchmarkModal.style.display = '';
    dom.benchmarkBody.innerHTML = '<p class="text-muted">로딩...</p>';
    try {
      const b = await api('GET', '/api/benchmark');
      if (b.completed === 0) {
        dom.benchmarkBody.innerHTML = '<p class="text-muted">완료된 문서가 없습니다.</p>';
        return;
      }

      dom.benchmarkBody.innerHTML =
        '<div class="bench-highlights">' +
          '<div class="bench-card">' +
            '<div class="num">' + b.throughput_per_min + '<span class="unit">건/분</span></div>' +
            '<div class="label">처리량</div>' +
          '</div>' +
          '<div class="bench-card">' +
            '<div class="num">' + _displayVal(b.quality_pass_rate) + '<span class="unit">%</span></div>' +
            '<div class="label">품질 통과율</div>' +
          '</div>' +
          '<div class="bench-card">' +
            '<div class="num">' + _displayVal(b.total_cost) + '</div>' +
            '<div class="label">총 비용</div>' +
          '</div>' +
        '</div>' +
        '<details>' +
          '<summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--text-secondary);">상세 보기</summary>' +
          '<dl class="bench-detail">' +
            '<dt>처리 건수</dt><dd>' + b.completed + '/' + b.total + ' (에러: ' + b.errors + ')</dd>' +
            '<dt>총 소요</dt><dd>' + b.total_duration_sec + '초</dd>' +
            '<dt>건당 평균</dt><dd>' + b.avg_duration_sec + '초</dd>' +
            '<dt>평균 confidence</dt><dd>' + _displayVal(b.avg_confidence) + '</dd>' +
            '<dt>건당 비용</dt><dd>' + _displayVal(b.cost_per_doc) + '</dd>' +
            '<dt>모드</dt><dd>' + b.mode + '</dd>' +
            '<dt>프리셋</dt><dd>' + b.preset + '</dd>' +
          '</dl>' +
        '</details>';
    } catch (err) {
      dom.benchmarkBody.innerHTML = '<p class="text-error">로드 실패: ' + escapeHtml(err.message) + '</p>';
    }
  }

  async function downloadBenchmarkCsv() {
    try {
      const data = await api('GET', '/api/benchmark');
      const headers = Object.keys(data);
      const values = headers.map(h => {
        const v = data[h];
        return typeof v === 'string' && v.includes(',') ? '"' + v + '"' : String(v);
      });
      const csv = headers.join(',') + '\n' + values.join(',') + '\n';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'xpipe_benchmark_' + Date.now() + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('CSV 다운로드 실패: ' + err.message);
    }
  }

  async function downloadBenchmarkJson() {
    try {
      const data = await api('GET', '/api/benchmark');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'xpipe_benchmark_' + Date.now() + '.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('다운로드 실패: ' + err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 문서 상세 모달 (요약 / 전체 텍스트)
  // ---------------------------------------------------------------------------
  function initDocModal() {
    $('#doc-modal-close').addEventListener('click', closeDocModal);
    // 배경 클릭으로 모달 닫지 않음 — x 버튼만으로 닫기

    // 탭 전환
    dom.docModal.querySelectorAll('.detail-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (!modalDocId) return;
        const doc = documents.find(d => d.id === modalDocId);
        if (!doc) return;
        openDocModal(doc, view);
      });
    });

    // 드래그 (모달 헤더로 드래그)
    const modalHeader = dom.docModal.querySelector('.modal-header');
    const modalEl = dom.docModal.querySelector('.modal');
    if (modalHeader && modalEl) {
      let isDragging = false, startX, startY, startLeft, startTop;
      modalHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        isDragging = true;
        const rect = modalEl.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        modalEl.style.left = (startLeft + e.clientX - startX) + 'px';
        modalEl.style.top = (startTop + e.clientY - startY) + 'px';
        modalEl.style.margin = '0';
      });
      document.addEventListener('mouseup', () => { isDragging = false; });
    }
  }

  function openDocModal(doc, view) {
    modalDocId = doc.id;
    dom.docModal.style.display = '';
    dom.docModalTitle.textContent = doc.filename;
    // 모달 위치 중앙 초기화
    const modalEl = dom.docModal.querySelector('.modal');
    if (modalEl) {
      modalEl.style.left = '';
      modalEl.style.top = '';
      modalEl.style.margin = '';
    }

    // preview 모달은 더 넓게
    const modalDocEl = dom.docModal.querySelector('.modal-doc');
    if (modalDocEl) modalDocEl.classList.toggle('modal-preview', view === 'preview');

    // 탭 active
    dom.docModal.querySelectorAll('.detail-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    if (view === 'summary') {
      renderModalSummary(doc);
    } else if (view === 'preview') {
      renderModalPreview(doc);
    } else {
      renderModalText(doc.id);
    }
  }

  function closeDocModal() {
    dom.docModal.style.display = 'none';
    modalDocId = null;
  }

  async function renderModalSummary(doc) {
    const el = dom.docModalBody;
    el.innerHTML = '<div class="ai-summary-loading"><div class="spinner"></div><p>AI 요약 생성 중...</p></div>';

    try {
      const data = await api('GET', '/api/summary/' + doc.id);

      if (data.simulation) {
        el.innerHTML = '<div class="ai-summary-view"><div class="ai-summary-sim">' +
          '<span class="text-muted">시뮬레이션 모드에서는 AI 요약을 제공하지 않습니다</span></div></div>';
        return;
      }

      const cached = data.cached ? ' <span class="text-muted">(캐시)</span>' : '';

      let html = '<div class="ai-summary-view">';
      html += '<div class="ai-summary-header">';
      html += '<span class="ai-summary-badge">AI 요약</span>' + cached;
      html += '</div>';
      html += '<div class="ai-summary-content">' + escapeHtml(data.summary || '') + '</div>';

      // 복사 버튼
      html += '<div class="ai-summary-actions">';
      html += '<button class="btn-xs" id="modal-copy-summary">클립보드 복사</button>';
      html += '</div>';
      html += '</div>';

      el.innerHTML = html;

      $('#modal-copy-summary').addEventListener('click', function () {
        navigator.clipboard.writeText(data.summary || '').then(() => {
          this.textContent = '복사 완료';
          setTimeout(() => { this.textContent = '클립보드 복사'; }, 1500);
        }).catch(() => alert('클립보드 복사 실패'));
      });

    } catch (err) {
      el.innerHTML = '<p class="text-error">AI 요약 실패: ' + escapeHtml(err.message) + '</p>';
    }
  }

  async function renderModalText(docId) {
    const el = dom.docModalBody;
    el.innerHTML = '<p class="text-muted">로딩...</p>';

    try {
      const data = await api('GET', '/api/text/' + docId);

      let html = '<div class="text-tab-header">';
      html += '<span class="text-tab-info">' + (data.text_length || 0) + '자</span>';
      html += '<div class="text-tab-actions">';
      html += '<button class="btn-xs" id="modal-copy-text">클립보드 복사</button>';
      html += '<button class="btn-xs" id="modal-download-text">TXT 다운로드</button>';
      html += '</div></div>';
      html += '<div class="text-content">' + escapeHtml(data.text || '(텍스트 없음)') + '</div>';

      el.innerHTML = html;

      $('#modal-copy-text').addEventListener('click', function () {
        navigator.clipboard.writeText(data.text || '').then(() => {
          this.textContent = '복사 완료';
          setTimeout(() => { this.textContent = '클립보드 복사'; }, 1500);
        }).catch(() => alert('클립보드 복사 실패'));
      });

      $('#modal-download-text').addEventListener('click', () => {
        const blob = new Blob([data.text || ''], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const doc = documents.find(d => d.id === docId);
        a.download = (doc ? doc.filename.replace(/\.[^.]+$/, '') : docId) + '_extracted.txt';
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      el.innerHTML = '<p class="text-error">텍스트 로드 실패: ' + escapeHtml(err.message) + '</p>';
    }
  }

  // ---------------------------------------------------------------------------
  // 파일 프리뷰 (파일명 클릭 시)
  // ---------------------------------------------------------------------------
  async function renderModalPreview(doc) {
    const el = dom.docModalBody;
    const ext = getFileExt(doc.filename);
    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const TEXT_EXTS = ['txt', 'md', 'csv', 'log', 'json', 'xml', 'yaml', 'yml'];
    const isImage = IMAGE_EXTS.includes(ext);
    const isText = TEXT_EXTS.includes(ext);
    const isPdf = ext === 'pdf';
    const isConverted = doc.is_converted;
    const hasPreview = doc.has_preview;

    let html = '';

    // AI 요약 (완료 상태이고 실제 실행 모드면)
    if (doc.status === 'completed') {
      html += '<div id="preview-summary-area"></div>';
    }

    // 파일 프리뷰
    html += '<div class="file-preview-label">파일 프리뷰';
    if (isConverted) {
      html += ' <span class="converted-badge">PDF 변환됨 · 원본 ' + ext.toUpperCase() + '</span>';
    }
    html += '</div>';

    if (!hasPreview) {
      if (doc.conversion_failed) {
        html += '<div class="preview-unavailable">PDF 변환 실패 — ' + escapeHtml(doc.conversion_error || '원본 파일 형식을 변환할 수 없습니다') + '</div>';
      } else {
        html += '<div class="preview-unavailable">이 파일 형식은 프리뷰를 지원하지 않습니다</div>';
      }
    } else if (isImage) {
      html += '<div class="file-preview"><div class="preview-loading" id="preview-spinner"><div class="spinner"></div><p>로딩 중...</p></div>' +
        '<img src="/api/file/' + doc.id + '" alt="' + escapeHtml(doc.filename) + '" onload="document.getElementById(\'preview-spinner\').style.display=\'none\'" onerror="document.getElementById(\'preview-spinner\').innerHTML=\'로드 실패\'"></div>';
    } else if (isPdf || isConverted) {
      html += '<div class="file-preview"><div class="preview-loading" id="preview-spinner"><div class="spinner"></div><p>프리뷰 로딩 중...</p></div>' +
        '<iframe src="/api/file/' + doc.id + '" onload="document.getElementById(\'preview-spinner\').style.display=\'none\'"></iframe></div>';
    } else if (isText) {
      html += '<div class="file-preview"><div class="preview-loading" id="preview-spinner"><div class="spinner"></div><p>로딩 중...</p></div>' +
        '<pre class="text-content" id="text-preview-content"></pre></div>';
    } else {
      html += '<div class="preview-unavailable">이 파일 형식은 프리뷰를 지원하지 않습니다</div>';
    }

    el.innerHTML = html;

    // 텍스트 파일 프리뷰 로드
    if (isText && hasPreview) {
      try {
        const res = await fetch('/api/file/' + doc.id);
        const text = await res.text();
        const preEl = $('#text-preview-content');
        const spinnerEl = $('#preview-spinner');
        if (preEl) preEl.textContent = text;
        if (spinnerEl) spinnerEl.style.display = 'none';
      } catch (e) {
        const spinnerEl = $('#preview-spinner');
        if (spinnerEl) spinnerEl.innerHTML = '로드 실패';
      }
    }

    // AI 요약 비동기 로드
    if (doc.status === 'completed') {
      const summaryArea = $('#preview-summary-area');
      if (summaryArea) {
        try {
          const data = await api('GET', '/api/summary/' + doc.id);
          if (data.simulation) {
            // 시뮬레이션 모드에서는 요약 표시 안 함
            summaryArea.remove();
          } else if (data.summary) {
            summaryArea.innerHTML =
              '<div class="ai-summary-view" style="margin-bottom:16px;">' +
              '<div class="ai-summary-header"><span class="ai-summary-badge">AI 요약</span>' +
              (data.cached ? ' <span class="text-muted">(캐시)</span>' : '') +
              '</div>' +
              '<div class="ai-summary-content">' + escapeHtml(data.summary) + '</div></div>';
          }
        } catch (e) {
          summaryArea.remove();
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SSE 실시간 이벤트
  // ---------------------------------------------------------------------------
  function initSSE() {
    connectSSE();
  }

  function connectSSE() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('/api/events');

    eventSource.onopen = () => {
      dom.sseStatus.className = 'status-indicator connected';
      dom.sseLabel.textContent = '연결됨';
      dom.sseLabel.className = 'sse-label connected';
      stopPolling();  // SSE 연결 시 폴링 중지
    };

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        eventCount++;
        dom.ftEvents.textContent = eventCount;

        // 이벤트 버퍼에 저장 (문서별 이벤트 추적)
        if (data.document_id) {
          sseEventBuffer.push(data);
          // 최대 500개
          if (sseEventBuffer.length > 500) sseEventBuffer.shift();
        }

        // 문서 상태 변경 이벤트 → 문서 목록 갱신
        if (data.event_type === 'stage_complete' ||
            data.event_type === 'stage_start' ||
            data.event_type === 'document_processed' ||
            data.event_type === 'error') {
          clearTimeout(pollTimer);
          pollTimer = setTimeout(refreshDocuments, 200);
        }

        // 완료 알림
        if (data.event_type === 'document_processed') {
          _notifyCompletion(data);
        }
      } catch (err) {
        // keepalive 등 무시
      }
    };

    eventSource.onerror = () => {
      dom.sseStatus.className = 'status-indicator disconnected';
      dom.sseLabel.textContent = '끊김';
      dom.sseLabel.className = 'sse-label disconnected';
      startPolling();  // SSE 끊김 시 폴링 fallback
    };
  }

  function _notifyCompletion(data) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification('xPipeWeb 처리 완료', {
        body: (data.payload && data.payload.document_type) || '문서 처리가 완료되었습니다.',
        icon: undefined,
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  // ---------------------------------------------------------------------------
  // 유틸리티
  // ---------------------------------------------------------------------------
  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function formatDate(ts) {
    if (!ts) return '-';
    try {
      const d = new Date(ts * 1000);
      const Y = d.getFullYear();
      const M = String(d.getMonth() + 1).padStart(2, '0');
      const D = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return Y + '.' + M + '.' + D + ' ' + h + ':' + m + ':' + s;
    } catch (e) {
      return '-';
    }
  }

  function getFileExt(filename) {
    if (!filename) return '';
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  }

  /** 처리 유형 판별: OCR / TXT / PDF변환 / PDF */
  function getProcessingType(ext) {
    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp'];
    const TEXT_EXTS = ['txt', 'md', 'csv', 'log', 'json', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'py', 'js', 'ts', 'html', 'css'];
    const CONVERT_EXTS = ['hwp', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'];
    if (IMAGE_EXTS.includes(ext)) return 'OCR';
    if (TEXT_EXTS.includes(ext)) return 'TXT';
    if (CONVERT_EXTS.includes(ext)) return 'PDF변환';
    if (ext === 'pdf') return 'PDF';
    return '-';
  }

  function renderProcessingBadge(ext) {
    const type = getProcessingType(ext);
    if (type === '-') return '<span class="text-muted">-</span>';
    const cls = {
      'OCR': 'proc-ocr', 'TXT': 'proc-txt',
      'PDF변환': 'proc-convert', 'PDF': 'proc-pdf',
    }[type] || '';
    return '<span class="proc-badge ' + cls + '">' + type + '</span>';
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('ko-KR', { hour12: false });
    } catch (e) {
      return typeof isoStr === 'string' ? isoStr.slice(11, 19) : '';
    }
  }

  // ---------------------------------------------------------------------------
  // 폴링 (SSE 끊김 시에만 fallback)
  // ---------------------------------------------------------------------------
  let pollIntervalId = null;

  function startPolling() {
    stopPolling();
    pollIntervalId = setInterval(async () => {
      const hasActive = documents.some(d => d.status === 'queued' || d.status === 'processing');
      if (hasActive) {
        await refreshDocuments();
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  }

  // ---------------------------------------------------------------------------
  // 초기화
  // ---------------------------------------------------------------------------
  function initSortableHeaders() {
    document.querySelectorAll('.doc-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (!key) return;
        if (sortColumn === key) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = key;
          sortDirection = 'asc';
        }
        // 헤더 UI 갱신
        document.querySelectorAll('.doc-table th.sortable').forEach(h => {
          h.classList.remove('sort-active');
          const arrow = h.querySelector('.sort-arrow');
          if (arrow) arrow.innerHTML = '';
        });
        th.classList.add('sort-active');
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.innerHTML = sortDirection === 'asc' ? '&#9650;' : '&#9660;';
        renderTable();
      });
    });
    // 초기 정렬 상태를 JS 변수 기준으로 헤더에 반영 (HTML 하드코딩 의존 제거)
    document.querySelectorAll('.doc-table th.sortable').forEach(h => {
      h.classList.remove('sort-active');
      const arrow = h.querySelector('.sort-arrow');
      if (arrow) arrow.innerHTML = '';
      if (h.dataset.sort === sortColumn) {
        h.classList.add('sort-active');
        if (arrow) arrow.innerHTML = sortDirection === 'asc' ? '&#9650;' : '&#9660;';
      }
    });
  }

  function init() {
    initConfig();
    initUpload();
    initFilters();
    initDetail();
    initBenchmark();
    initDocModal();
    initSortableHeaders();
    initSSE();
    refreshDocuments();

    // 브라우저 알림 권한 요청
    if ('Notification' in window && Notification.permission === 'default') {
      // 사용자 상호작용 시 요청 (자동 요청은 차단될 수 있음)
      document.addEventListener('click', function reqNotif() {
        Notification.requestPermission();
        document.removeEventListener('click', reqNotif);
      }, { once: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
