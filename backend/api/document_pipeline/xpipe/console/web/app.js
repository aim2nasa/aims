/**
 * xPipeWeb v2 — 체험 도구 클라이언트 (Vanilla JS, 외부 의존 없음)
 *
 * R1: 파이프라인 아코디언 (각 스테이지 input→output)
 * R2: 추출 텍스트 탭 (전문 보기 + 다운로드/복사)
 * R3: 모델 선택/변경/표시
 * R4: stub 값 정리 (confidence/비용/품질 → "-")
 * R5: OCR 경로 (이미지 업로드 시 OCR 모델 표시)
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
    detailPanel: $('#detail-panel'),
    detailFilename: $('#detail-filename'),
    detailContent: $('#detail-content'),
    benchmarkModal: $('#benchmark-modal'),
    benchmarkBody: $('#benchmark-body'),
    ftCompleted: $('#ft-completed'),
    ftTotal: $('#ft-total'),
    ftEvents: $('#ft-events'),
    ftCost: $('#ft-cost'),
    ftVersion: $('#ft-version'),
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
        const data = await api('PUT', '/api/config', {
          adapter: $('#cfg-adapter').value,
          preset: $('#cfg-preset').value,
          mode: $('#cfg-mode').value,
          quality_gate: $('#cfg-quality').value === 'true',
          models: {
            llm: $('#cfg-llm').value,
            ocr: $('#cfg-ocr').value,
            embedding: $('#cfg-embedding').value,
          },
        });
        updateConfigDisplay(data.config);
        dom.configPanel.style.display = 'none';
        dom.configToggle.classList.remove('open');
      } catch (e) {
        alert('설정 변경 실패: ' + e.message);
      }
    });

    // 초기 설정 로드
    api('GET', '/api/config').then(data => {
      updateConfigDisplay(data.config);
      // 프리셋 옵션 업데이트
      const presetSelect = $('#cfg-preset');
      presetSelect.innerHTML = '';
      data.available_presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name + ' (' + p.stage_count + '단계)';
        presetSelect.appendChild(opt);
      });
      presetSelect.value = data.config.preset;
      $('#cfg-adapter').value = data.config.adapter;
      $('#cfg-mode').value = data.config.mode;
      $('#cfg-quality').value = String(data.config.quality_gate);

      // 모델 드롭다운 업데이트
      if (data.available_models) {
        _populateModelSelect('#cfg-llm', data.available_models.llm, data.config.models.llm);
        _populateModelSelect('#cfg-ocr', data.available_models.ocr, data.config.models.ocr);
        _populateModelSelect('#cfg-embedding', data.available_models.embedding, data.config.models.embedding);
      }
    }).catch(() => {});
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
    const adapterLabel = { insurance: 'Insurance', legal: 'Legal', none: 'None' }[cfg.adapter] || cfg.adapter;
    const modeLabel = cfg.mode === 'stub' ? 'stub (시뮬레이션)' : cfg.mode;
    const modelsStr = cfg.models
      ? cfg.models.llm + ' / ' + cfg.models.ocr + ' / ' + cfg.models.embedding
      : '';
    dom.configDisplay.textContent = adapterLabel + ' / ' + cfg.preset + ' / ' + modeLabel +
      (modelsStr ? ' | ' + modelsStr : '');
    dom.ftVersion.textContent = 'xPipeWeb v2.0.0 / ' + modeLabel;
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
          renderDetail(doc);
        } else {
          // 서버 재시작 등으로 문서가 사라진 경우
          selectedDocId = null;
          dom.detailPanel.style.display = 'none';
        }
      }
    } catch (e) {
      console.error('문서 목록 갱신 실패:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // 테이블 렌더링 (R4: stub 값 정리)
  // ---------------------------------------------------------------------------
  function renderTable() {
    const filtered = currentFilter === 'all'
      ? documents
      : documents.filter(d => d.status === currentFilter);

    if (documents.length === 0) {
      dom.emptyState.style.display = '';
      dom.filterBar.style.display = 'none';
      dom.tableSection.style.display = 'none';
      return;
    }

    dom.emptyState.style.display = 'none';
    dom.filterBar.style.display = '';
    dom.tableSection.style.display = '';

    dom.docTbody.innerHTML = filtered.map(doc => {
      const statusHtml = renderStatusCell(doc);
      const classifyHtml = doc.result ? escapeHtml(doc.result.document_type) : '<span class="text-muted">-</span>';
      const detectHtml = renderDetections(doc);
      const qualityHtml = renderQuality(doc);
      const costHtml = renderCost(doc);
      const durationHtml = doc.duration ? doc.duration.toFixed(2) + 's' : '<span class="text-muted">-</span>';
      const actionsHtml = renderActions(doc);
      const rowClass = doc.status === 'error' ? 'error-row' : '';
      const selClass = doc.id === selectedDocId ? 'selected' : '';

      return '<tr class="' + rowClass + ' ' + selClass + '" data-id="' + doc.id + '">' +
        '<td>' + truncate(doc.filename, 28) + '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td>' + classifyHtml + '</td>' +
        '<td>' + detectHtml + '</td>' +
        '<td>' + qualityHtml + '</td>' +
        '<td>' + costHtml + '</td>' +
        '<td>' + durationHtml + '</td>' +
        '<td>' + actionsHtml + '</td>' +
        '</tr>';
    }).join('');

    // 행 클릭 이벤트
    dom.docTbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const id = tr.dataset.id;
        selectedDocId = id;
        const doc = documents.find(d => d.id === id);
        if (doc) showDetail(doc);
        renderTable();
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
            selectedDocId = null;
            dom.detailPanel.style.display = 'none';
          }
          await refreshDocuments();
        } catch (err) {
          alert('제거 실패: ' + err.message);
        }
      });
    });
  }

  function renderStatusCell(doc) {
    const pct = doc.progress || 0;
    let fillClass = '';
    let label = '';

    switch (doc.status) {
      case 'queued': label = '대기'; break;
      case 'processing':
        fillClass = 'processing';
        label = doc.current_stage || '처리중';
        break;
      case 'completed':
        fillClass = 'completed';
        label = '완료';
        break;
      case 'error':
        fillClass = 'error';
        label = '에러';
        break;
      default: label = doc.status;
    }

    return '<div class="progress-cell">' +
      '<div class="progress-bar"><div class="progress-fill ' + fillClass + '" style="width:' + pct + '%"></div></div>' +
      '<span class="progress-text">' + label + '</span>' +
      '</div>';
  }

  function renderDetections(doc) {
    if (!doc.result || !doc.result.detections || doc.result.detections.length === 0) {
      return '<span class="text-muted">-</span>';
    }
    return doc.result.detections.map(d => escapeHtml(d.doc_type || d)).join(', ');
  }

  // R4: stub이면 품질 "-"
  function renderQuality(doc) {
    if (!doc.quality) return '<span class="text-muted">-</span>';
    const q = doc.quality;
    const cls = q.passed ? 'badge-pass' : 'badge-fail';
    const txt = q.passed ? 'PASS' : 'FAIL';
    return '<span class="badge ' + cls + '">' + q.overall.toFixed(2) + ' ' + txt + '</span>';
  }

  // R4: stub이면 비용 "-"
  function renderCost(doc) {
    if (doc.cost === null || doc.cost === undefined) return '<span class="text-muted">-</span>';
    return '$' + doc.cost.toFixed(3);
  }

  function renderActions(doc) {
    let html = '<div class="action-btns">';
    if (doc.status === 'error') {
      html += '<button class="btn-xs btn-retry" data-id="' + doc.id + '">재시도</button>';
    }
    const isProcessing = doc.status === 'queued' || doc.status === 'processing';
    html += '<button class="btn-xs btn-remove" data-id="' + doc.id + '"' +
      (isProcessing ? ' disabled' : '') + '>제거</button>';
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
          selectedDocId = null;
          dom.detailPanel.style.display = 'none';
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

    // 완료 문서 0건이면 벤치마크 버튼 비활성화
    const benchBtn = $('#btn-benchmark');
    if (benchBtn) {
      benchBtn.disabled = completed === 0;
    }
  }

  // ---------------------------------------------------------------------------
  // 상세 패널
  // ---------------------------------------------------------------------------
  function initDetail() {
    $('#detail-close').addEventListener('click', () => {
      dom.detailPanel.style.display = 'none';
      selectedDocId = null;
      renderTable();
    });

    // 탭 전환
    $$('.detail-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.detail-tabs .tab').forEach(t => t.classList.remove('active'));
        $$('.tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        $('#tab-' + tab.dataset.tab).classList.add('active');

        if (tab.dataset.tab === 'text' && selectedDocId) loadExtractedText(selectedDocId);
        if (tab.dataset.tab === 'audit' && selectedDocId) loadAudit(selectedDocId);
        if (tab.dataset.tab === 'events' && selectedDocId) renderEventsTab(selectedDocId);
      });
    });
  }

  function showDetail(doc) {
    dom.detailPanel.style.display = '';
    renderDetail(doc);
  }

  function renderDetail(doc) {
    dom.detailFilename.textContent = doc.filename;
    renderPipelineTab(doc);
  }

  // ---------------------------------------------------------------------------
  // R1: 파이프라인 플로우 시각화 + 아코디언
  // ---------------------------------------------------------------------------

  // 현재 선택된 스테이지 (플로우에서 클릭 시)
  let selectedStage = null;

  async function renderPipelineTab(doc) {
    const el = $('#tab-pipeline');
    el.innerHTML = '<p class="text-muted">로딩...</p>';

    let stagesData = {};
    try {
      const resp = await api('GET', '/api/stages/' + doc.id);
      stagesData = resp.stages_data || {};
    } catch (e) {
      // 아직 데이터 없을 수 있음
    }

    const stagesDetail = doc.stages_detail || {};
    const stageOrder = Object.keys(stagesDetail);

    if (stageOrder.length === 0) {
      el.innerHTML = '<p class="text-muted">스테이지가 없습니다.</p>';
      return;
    }

    const isError = doc.status === 'error';
    const errorStage = doc.error_stage;
    const skippedStages = doc.result ? (doc.result.stages_skipped || []) : [];

    // --- 파이프라인 플로우 (가로 화살표) ---
    let html = '<div class="pipeline-flow">';
    for (let i = 0; i < stageOrder.length; i++) {
      const name = stageOrder[i];
      const detail = stagesDetail[name] || {};
      let status = detail.status || 'pending';
      const isCurrentError = isError && errorStage === name;
      const isSkipped = skippedStages.includes(name);

      if (isCurrentError) status = 'error';
      if (isSkipped && status !== 'error') status = 'skipped';

      const activeClass = selectedStage === name ? ' active' : '';

      html += '<span class="pipeline-stage ' + status + activeClass + '" data-stage="' + name + '">';
      html += _stageKoreanName(name);
      html += '</span>';

      if (i < stageOrder.length - 1) {
        html += '<span class="pipeline-arrow">&#8594;</span>';
      }
    }
    html += '</div>';

    // --- 스테이지 상세 패널 (클릭 시 펼침) ---
    html += '<div class="pipeline-detail-panel" id="pipeline-detail-panel"></div>';

    // --- 아코디언 (기존) ---
    html += '<ul class="accordion">';

    for (const name of stageOrder) {
      const detail = stagesDetail[name] || {};
      const data = stagesData[name] || {};
      const status = detail.status || 'pending';
      const isCurrentError = isError && errorStage === name;

      const icon = _stageIcon(status, isCurrentError);
      const durationMs = data.duration_ms || detail.duration_ms || 0;
      const durationStr = durationMs > 0 ? durationMs + 'ms' : '';
      const summary = _stageSummary(name, data, status);
      const errorClass = isCurrentError ? ' error' : '';
      const autoOpen = isCurrentError;

      html += '<li class="accordion-item' + errorClass + '">';
      html += '<div class="accordion-header' + (autoOpen ? ' open' : '') + '" data-stage="' + name + '">';
      html += '<span class="accordion-icon">' + icon + '</span>';
      html += '<span class="accordion-name">' + _stageDisplayName(name) + '</span>';
      html += '<span class="accordion-duration">' + durationStr + '</span>';
      html += '<span class="accordion-summary">' + summary + '</span>';
      html += '<span class="accordion-arrow">&#9660;</span>';
      html += '</div>';
      html += '<div class="accordion-body' + (autoOpen ? ' open' : '') + '">';
      html += _renderStageData(name, data, status, doc);
      if (isCurrentError && doc.error) {
        html += '<div class="error-msg">' +
          '<span>' + escapeHtml(doc.error) + '</span>' +
          '<button class="btn-xs btn-retry" data-id="' + doc.id + '">재시도</button>' +
          '</div>';
      }
      html += '</div>';
      html += '</li>';
    }

    html += '</ul>';
    el.innerHTML = html;

    // --- 플로우 스테이지 클릭 이벤트 ---
    el.querySelectorAll('.pipeline-stage').forEach(stageEl => {
      stageEl.addEventListener('click', () => {
        const stageName = stageEl.dataset.stage;

        // 토글: 같은 스테이지 다시 클릭하면 닫기
        if (selectedStage === stageName) {
          selectedStage = null;
          el.querySelectorAll('.pipeline-stage').forEach(s => s.classList.remove('active'));
          $('#pipeline-detail-panel').innerHTML = '';
          return;
        }

        selectedStage = stageName;
        el.querySelectorAll('.pipeline-stage').forEach(s => s.classList.remove('active'));
        stageEl.classList.add('active');

        // 상세 패널 렌더링
        _renderFlowDetail(stageName, stagesData, stagesDetail, doc, skippedStages);
      });
    });

    // 아코디언 토글 이벤트
    el.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        header.classList.toggle('open');
        header.nextElementSibling.classList.toggle('open');
      });
    });

    // 에러 재시도 버튼
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

  /**
   * 파이프라인 플로우에서 스테이지 클릭 시 상세 패널 렌더링
   */
  function _renderFlowDetail(stageName, stagesData, stagesDetail, doc, skippedStages) {
    const panel = $('#pipeline-detail-panel');
    if (!panel) return;

    const data = stagesData[stageName] || {};
    const detail = stagesDetail[stageName] || {};
    const status = detail.status || 'pending';
    const isSkipped = skippedStages.includes(stageName);
    const isError = doc.status === 'error' && doc.error_stage === stageName;

    let html = '<div class="flow-detail-card">';
    html += '<div class="flow-detail-header">';
    html += '<span class="flow-detail-title">' + _stageKoreanName(stageName) + '</span>';

    const durationMs = data.duration_ms || detail.duration_ms || 0;
    if (durationMs > 0) {
      html += '<span class="flow-detail-duration">' + _formatDuration(durationMs) + '</span>';
    }
    html += '</div>';

    // 스킵된 스테이지
    if (isSkipped) {
      html += '<div class="flow-detail-skip">';
      html += _getSkipReason(stageName, doc);
      html += '</div>';
      html += '</div>';
      panel.innerHTML = html;
      return;
    }

    // 에러 스테이지
    if (isError && doc.error) {
      html += '<div class="error-msg">' + escapeHtml(doc.error) + '</div>';
    }

    // 대기/처리중
    if (status === 'pending' || status === 'running') {
      html += '<div class="flow-detail-status">' +
        (status === 'pending' ? '대기 중' : '처리 중...') + '</div>';
      html += '</div>';
      panel.innerHTML = html;
      return;
    }

    // 완료된 스테이지: 입력/출력 표시
    if (data.input) {
      html += '<div class="flow-detail-section">';
      html += '<div class="io-label input">입력</div>';
      html += '<div class="flow-detail-grid">';
      html += _renderFlowKV(data.input);
      html += '</div></div>';
    }

    if (data.output) {
      html += '<div class="flow-detail-section">';
      html += '<div class="io-label output">출력</div>';
      html += '<div class="flow-detail-grid">';
      // full_text 미리보기 제한
      const outputCopy = Object.assign({}, data.output);
      if (outputCopy.full_text && outputCopy.full_text.length > 300) {
        outputCopy.full_text = outputCopy.full_text.substring(0, 300) + '...';
      }
      html += _renderFlowKV(outputCopy);
      html += '</div></div>';
    }

    html += '</div>';
    panel.innerHTML = html;
  }

  function _getSkipReason(stageName, doc) {
    switch (stageName) {
      case 'convert':
        return '변환 불필요 (PDF/이미지/텍스트 파일)';
      case 'extract':
        return '이미 텍스트가 존재하여 추출을 건너뛰었습니다';
      case 'embed':
        return '크레딧 부족으로 임베딩을 건너뛰었습니다';
      default:
        return '조건에 따라 건너뛰었습니다';
    }
  }

  function _renderFlowKV(obj) {
    let html = '';
    for (const [k, v] of Object.entries(obj)) {
      const displayVal = _displayVal(v);
      html += '<span class="flow-kv-key">' + escapeHtml(k) + '</span>';
      html += '<span class="flow-kv-val">' + escapeHtml(displayVal) + '</span>';
    }
    return html;
  }

  function _formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  function _stageIcon(status, isError) {
    if (isError) return '<span style="color:var(--error)">&#10007;</span>';
    const icons = {
      pending: '<span style="color:var(--text-tertiary)">&#9711;</span>',
      running: '<span style="color:var(--processing)">&#9881;</span>',
      completed: '<span style="color:var(--success)">&#10003;</span>',
      skipped: '<span style="color:var(--text-tertiary)">&#10140;</span>',
    };
    return icons[status] || icons.pending;
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

  // 파이프라인 한글 표시명
  function _stageKoreanName(name) {
    const names = {
      ingest: '업로드',
      convert: 'PDF변환',
      extract: '텍스트추출',
      classify: 'AI분류',
      detect_special: '감지',
      embed: '임베딩',
      complete: '완료',
    };
    return names[name] || name;
  }

  function _stageSummary(name, data, status) {
    if (status === 'pending') return '';
    if (status === 'running') return '처리중...';
    if (!data || !data.output) return '';

    const out = data.output;
    switch (name) {
      case 'ingest':
        return (out.file_size ? formatSize(out.file_size) : '') + ' / ' + (out.mime_type || '-');
      case 'convert':
        return (out.method || '-') + ' / ' + (out.output_mime_type || 'PDF');
      case 'extract':
        return (out.method || '-') + ' / ' + (out.text_length || 0) + '자';
      case 'classify':
        return (out.document_type || '-') + ' / ' + _displayVal(out.confidence);
      case 'detect_special':
        return out.detected_type && out.detected_type !== '-'
          ? out.detected_type
          : '감지 없음';
      case 'embed':
        return (out.vector_dims || '-') + 'd / ' + (out.chunk_count || 0) + '청크';
      case 'complete':
        return (out.total_duration_ms || 0) + 'ms / ' + _displayVal(out.total_cost);
      default:
        return '';
    }
  }

  function _renderStageData(name, data, status, doc) {
    if (status === 'pending' || status === 'running') {
      return '<p class="text-muted">' + (status === 'pending' ? '대기 중' : '처리 중...') + '</p>';
    }
    if (!data || !data.input) {
      return '<p class="text-muted">데이터 없음</p>';
    }

    let html = '';
    // Input
    html += '<div class="io-section">';
    html += '<div class="io-label input">INPUT</div>';
    html += '<div class="io-grid">';
    html += _renderKVPairs(data.input);
    html += '</div></div>';

    // 화살표
    html += '<div class="io-arrow">&#8595;</div>';

    // Output
    html += '<div class="io-section">';
    html += '<div class="io-label output">OUTPUT</div>';
    html += '<div class="io-grid">';
    // full_text는 너무 길 수 있으므로 미리보기만
    const outputCopy = Object.assign({}, data.output);
    if (outputCopy.full_text && outputCopy.full_text.length > 200) {
      outputCopy.full_text = outputCopy.full_text.substring(0, 200) + '...';
    }
    html += _renderKVPairs(outputCopy);
    html += '</div></div>';

    return html;
  }

  function _renderKVPairs(obj) {
    let html = '';
    for (const [k, v] of Object.entries(obj)) {
      const displayKey = k;
      const displayVal = _displayVal(v);
      const stubClass = (typeof v === 'string' && v.includes('(stub)')) ? ' stub' : '';
      html += '<span class="io-key">' + escapeHtml(displayKey) + '</span>';
      html += '<span class="io-val' + stubClass + '">' + escapeHtml(displayVal) + '</span>';
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
  // R2: 추출 텍스트 탭
  // ---------------------------------------------------------------------------
  async function loadExtractedText(docId) {
    const el = $('#tab-text');
    el.innerHTML = '<p class="text-muted">로딩...</p>';

    try {
      const data = await api('GET', '/api/text/' + docId);

      let html = '<div class="text-tab-header">';
      html += '<span class="text-tab-info">' + (data.text_length || 0) + '자</span>';
      html += '<div class="text-tab-actions">';
      html += '<button class="btn-xs" id="btn-copy-text">클립보드 복사</button>';
      html += '<button class="btn-xs" id="btn-download-text">TXT 다운로드</button>';
      html += '</div></div>';

      if (data.is_stub) {
        html += '<div class="stub-banner">[stub] 시뮬레이션 텍스트입니다. 실제 문서 내용이 아닙니다.</div>';
      }

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
  // 이벤트 탭
  // ---------------------------------------------------------------------------
  function renderEventsTab(docId) {
    const el = $('#tab-events');
    const docEvents = sseEventBuffer.filter(e => e.document_id === docId);

    if (docEvents.length === 0) {
      el.innerHTML = '<p class="text-muted">이벤트가 없습니다.</p>';
      return;
    }

    let html = '<ul class="log-list">';
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
  // 감사 로그 탭
  // ---------------------------------------------------------------------------
  async function loadAudit(docId) {
    const el = $('#tab-audit');
    el.innerHTML = '<p class="text-muted">로딩...</p>';
    try {
      const data = await api('GET', '/api/audit/' + docId);
      if (!data.entries || data.entries.length === 0) {
        el.innerHTML = '<p class="text-muted">감사 로그가 없습니다.</p>';  // 이미 통일 패턴
        return;
      }
      let html = '<ul class="log-list">';
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
      el.innerHTML = '<p class="text-error">로드 실패: ' + escapeHtml(err.message) + '</p>';
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

        // 완료 알림 (R5: 브라우저 Notification)
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
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    return (bytes / 1024 / 1024).toFixed(1) + 'MB';
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
  function init() {
    initConfig();
    initUpload();
    initFilters();
    initDetail();
    initBenchmark();
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
