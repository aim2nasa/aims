/**
 * xPipeWeb — 클라이언트 로직 (Vanilla JS, 외부 의존 없음)
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 상태
  // ---------------------------------------------------------------------------
  let documents = [];         // 문서 목록 캐시
  let selectedDocId = null;   // 현재 선택된 문서 ID
  let currentFilter = 'all';  // 현재 필터
  let eventSource = null;     // SSE EventSource
  let eventCount = 0;         // 수신 이벤트 수
  let pollTimer = null;       // 폴링 타이머

  // ---------------------------------------------------------------------------
  // DOM 참조
  // ---------------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    sseStatus: $('#sse-status'),
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
    // 하단 바
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
  // 설정
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
          quality_gate: $('#cfg-quality').value === 'true',
          provider: $('#cfg-provider').value,
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
        opt.textContent = `${p.name} (${p.stage_count}단계)`;
        presetSelect.appendChild(opt);
      });
      presetSelect.value = data.config.preset;
      $('#cfg-adapter').value = data.config.adapter;
      $('#cfg-quality').value = String(data.config.quality_gate);
      $('#cfg-provider').value = data.config.provider;
    }).catch(() => {});
  }

  function updateConfigDisplay(cfg) {
    const adapterLabel = { insurance: 'Insurance', legal: 'Legal', none: 'None' }[cfg.adapter] || cfg.adapter;
    dom.configDisplay.textContent = `${adapterLabel} / ${cfg.preset} / ${cfg.provider}`;
    dom.ftVersion.textContent = `xPipeWeb v0.1.0 / ${cfg.provider}`;
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

    // 업로드 영역 축소
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

    // 즉시 새로고침
    await refreshDocuments();
  }

  // ---------------------------------------------------------------------------
  // 문서 목록 갱신
  // ---------------------------------------------------------------------------
  async function refreshDocuments() {
    try {
      const data = await api('GET', '/api/documents');
      documents = data.documents || [];
      renderTable();
      updateFooter();
      updateFilters();

      // 상세 패널 열려있으면 갱신
      if (selectedDocId) {
        const doc = documents.find(d => d.id === selectedDocId);
        if (doc) renderDetail(doc);
      }
    } catch (e) {
      console.error('문서 목록 갱신 실패:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // 테이블 렌더링
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
      const classifyHtml = doc.result ? doc.result.document_type : '<span class="text-muted">-</span>';
      const detectHtml = renderDetections(doc);
      const qualityHtml = renderQuality(doc);
      const costHtml = doc.cost ? `$${doc.cost.toFixed(3)}` : '<span class="text-muted">-</span>';
      const durationHtml = doc.duration ? `${doc.duration.toFixed(2)}s` : '<span class="text-muted">-</span>';
      const actionsHtml = renderActions(doc);
      const rowClass = doc.status === 'error' ? 'error-row' : '';
      const selClass = doc.id === selectedDocId ? 'selected' : '';

      return `<tr class="${rowClass} ${selClass}" data-id="${doc.id}">
        <td title="${doc.filename}">${truncate(doc.filename, 28)}</td>
        <td>${statusHtml}</td>
        <td>${classifyHtml}</td>
        <td>${detectHtml}</td>
        <td>${qualityHtml}</td>
        <td>${costHtml}</td>
        <td>${durationHtml}</td>
        <td>${actionsHtml}</td>
      </tr>`;
    }).join('');

    // 행 클릭 이벤트
    dom.docTbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        // 버튼 클릭 제외
        if (e.target.closest('button')) return;
        const id = tr.dataset.id;
        selectedDocId = id;
        const doc = documents.find(d => d.id === id);
        if (doc) showDetail(doc);
        renderTable(); // 선택 표시 갱신
      });
    });

    // 재시도/제거 버튼
    dom.docTbody.querySelectorAll('.btn-retry').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          await api('POST', `/api/retry/${id}`);
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
          await api('DELETE', `/api/documents/${id}`);
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
      case 'queued':
        label = '대기';
        break;
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
      default:
        label = doc.status;
    }

    return `<div class="progress-cell">
      <div class="progress-bar"><div class="progress-fill ${fillClass}" style="width:${pct}%"></div></div>
      <span class="progress-text">${label}</span>
    </div>`;
  }

  function renderDetections(doc) {
    if (!doc.result || !doc.result.detections || doc.result.detections.length === 0) {
      return '<span class="text-muted">-</span>';
    }
    return doc.result.detections.map(d => d.doc_type || d).join(', ');
  }

  function renderQuality(doc) {
    if (!doc.quality) return '<span class="text-muted">-</span>';
    const q = doc.quality;
    const cls = q.passed ? 'badge-pass' : 'badge-fail';
    const txt = q.passed ? 'PASS' : 'FAIL';
    return `<span class="badge ${cls}">${q.overall.toFixed(2)} ${txt}</span>`;
  }

  function renderActions(doc) {
    if (doc.status === 'error') {
      return `<div class="action-btns">
        <button class="btn-xs btn-retry" data-id="${doc.id}">재시도</button>
        <button class="btn-xs btn-remove" data-id="${doc.id}">제거</button>
      </div>`;
    }
    return '';
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
  }

  function updateFilters() {
    const counts = { all: 0, queued: 0, processing: 0, completed: 0, error: 0 };
    documents.forEach(d => {
      counts.all++;
      if (counts[d.status] !== undefined) counts[d.status]++;
    });
    Object.entries(counts).forEach(([key, val]) => {
      const el = $(`#cnt-${key}`);
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
    dom.ftCost.textContent = totalCost.toFixed(3);
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
        $(`#tab-${tab.dataset.tab}`).classList.add('active');

        // 감사로그/비용 탭은 API 호출
        if (tab.dataset.tab === 'audit' && selectedDocId) loadAudit(selectedDocId);
        if (tab.dataset.tab === 'cost') loadCost();
      });
    });
  }

  function showDetail(doc) {
    dom.detailPanel.style.display = '';
    renderDetail(doc);
  }

  function renderDetail(doc) {
    dom.detailFilename.textContent = doc.filename;

    // 파이프라인 탭
    renderPipelineTab(doc);

    // 메타데이터 탭
    renderMetadataTab(doc);

    // 이벤트 탭
    renderEventsTab(doc);
  }

  function renderPipelineTab(doc) {
    const el = $('#tab-pipeline');
    if (!doc.result) {
      const stages = Object.entries(doc.stages_detail || {}).map(([name, info]) => {
        return renderStageItem(name, info.status, null, null);
      }).join('');
      el.innerHTML = `<ul class="stage-list">${stages}</ul>`;
      return;
    }

    const executed = doc.result.stages_executed || [];
    const skipped = doc.result.stages_skipped || [];
    const stages = Object.entries(doc.stages_detail || {}).map(([name, info]) => {
      let status = 'pending';
      let detail = '';
      if (executed.includes(name)) {
        status = 'completed';
      } else if (skipped.includes(name)) {
        status = 'skipped';
        detail = '스킵';
      }
      return renderStageItem(name, status, info.duration, detail);
    }).join('');

    el.innerHTML = `<ul class="stage-list">${stages}</ul>`;
  }

  function renderStageItem(name, status, duration, detail) {
    const icons = {
      pending: '<span style="color:var(--text-tertiary)">&#9711;</span>',
      running: '<span style="color:var(--processing)">&#9881;</span>',
      completed: '<span style="color:var(--success)">&#10003;</span>',
      skipped: '<span style="color:var(--text-tertiary)">&#10140;</span>',
      error: '<span style="color:var(--error)">&#10007;</span>',
    };
    const icon = icons[status] || icons.pending;
    const durStr = duration ? `${duration.toFixed(3)}s` : '';
    const detailStr = detail ? detail : '';

    return `<li class="stage-item">
      <span class="stage-icon">${icon}</span>
      <span class="stage-name">${name}</span>
      <span class="stage-duration">${durStr}</span>
      <span class="stage-info">${detailStr}</span>
    </li>`;
  }

  function renderMetadataTab(doc) {
    const el = $('#tab-metadata');
    const r = doc.result || {};
    const q = doc.quality || {};

    const rows = [
      ['파일명', doc.filename],
      ['파일 크기', formatSize(doc.file_size)],
      ['상태', doc.status],
      ['분류', r.document_type || '-'],
      ['신뢰도', r.classification_confidence ? r.classification_confidence.toFixed(4) : '-'],
      ['감지', (r.detections || []).length > 0 ? JSON.stringify(r.detections) : '-'],
      ['텍스트 미리보기', r.text_preview || '-'],
      ['품질 점수', q.overall !== undefined ? q.overall.toFixed(4) : '-'],
      ['품질 플래그', (q.flags || []).join(', ') || '-'],
      ['소요 시간', doc.duration ? `${doc.duration.toFixed(2)}s` : '-'],
      ['비용', doc.cost ? `$${doc.cost.toFixed(6)}` : '-'],
      ['프리셋', doc.config ? doc.config.preset : '-'],
      ['어댑터', doc.config ? doc.config.adapter : '-'],
      ['프로바이더', doc.config ? doc.config.provider : '-'],
    ];

    el.innerHTML = `<div class="meta-grid">${rows.map(([k, v]) =>
      `<span class="meta-key">${k}</span><span class="meta-val">${escapeHtml(String(v))}</span>`
    ).join('')}</div>`;
  }

  function renderEventsTab(doc) {
    const el = $('#tab-events');
    // doc_id 기반 이벤트 필터링 (SSE 버퍼에서)
    // 간이 구현: 전역 이벤트에서 해당 doc_id만 필터
    el.innerHTML = '<p class="text-muted">SSE 이벤트는 실시간으로 수신됩니다. 문서 처리 중 이벤트가 여기에 표시됩니다.</p>';
  }

  async function loadAudit(docId) {
    const el = $('#tab-audit');
    el.innerHTML = '<p class="text-muted">로딩...</p>';
    try {
      const data = await api('GET', `/api/audit/${docId}`);
      if (!data.entries || data.entries.length === 0) {
        el.innerHTML = '<p class="text-muted">감사 로그가 없습니다.</p>';
        return;
      }
      el.innerHTML = `<ul class="log-list">${data.entries.map(e =>
        `<li class="log-item">
          <span class="log-time">${formatTime(e.timestamp)}</span>
          <span class="log-type">${e.action}</span>
          <span class="log-msg">${e.stage} / ${e.actor}</span>
        </li>`
      ).join('')}</ul>`;
    } catch (err) {
      el.innerHTML = `<p class="text-error">로드 실패: ${err.message}</p>`;
    }
  }

  async function loadCost() {
    const el = $('#tab-cost');
    el.innerHTML = '<p class="text-muted">로딩...</p>';
    try {
      const data = await api('GET', '/api/cost');
      const rows = [
        ['총 기록', data.total_records],
        ['총 비용', `$${data.total_cost.toFixed(6)}`],
        ['총 입력 토큰', data.total_input_tokens.toLocaleString()],
        ['총 출력 토큰', data.total_output_tokens.toLocaleString()],
      ];

      let html = `<div class="meta-grid">${rows.map(([k, v]) =>
        `<span class="meta-key">${k}</span><span class="meta-val">${v}</span>`
      ).join('')}</div>`;

      if (data.by_provider && Object.keys(data.by_provider).length > 0) {
        html += '<h4 style="margin-top:16px;font-size:12px;font-weight:600;">Provider별</h4>';
        html += '<div class="meta-grid">';
        for (const [name, info] of Object.entries(data.by_provider)) {
          html += `<span class="meta-key">${name}</span><span class="meta-val">$${info.cost.toFixed(6)} (${info.count}건)</span>`;
        }
        html += '</div>';
      }

      el.innerHTML = html;
    } catch (err) {
      el.innerHTML = `<p class="text-error">로드 실패: ${err.message}</p>`;
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

      dom.benchmarkBody.innerHTML = `
        <div class="bench-highlights">
          <div class="bench-card">
            <div class="num">${b.throughput_per_min}<span class="unit">건/분</span></div>
            <div class="label">처리량</div>
          </div>
          <div class="bench-card">
            <div class="num">${b.quality_pass_rate}<span class="unit">%</span></div>
            <div class="label">품질 통과율</div>
          </div>
          <div class="bench-card">
            <div class="num">$${b.total_cost.toFixed(3)}</div>
            <div class="label">총 비용</div>
          </div>
        </div>
        <details>
          <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--text-secondary);">상세 보기</summary>
          <dl class="bench-detail">
            <dt>처리 건수</dt><dd>${b.completed}/${b.total} (에러: ${b.errors})</dd>
            <dt>총 소요</dt><dd>${b.total_duration_sec}초</dd>
            <dt>건당 평균</dt><dd>${b.avg_duration_sec}초</dd>
            <dt>평균 confidence</dt><dd>${b.avg_confidence}</dd>
            <dt>건당 비용</dt><dd>$${b.cost_per_doc.toFixed(6)}</dd>
            <dt>Provider</dt><dd>${b.provider}</dd>
            <dt>프리셋</dt><dd>${b.preset}</dd>
          </dl>
        </details>
      `;
    } catch (err) {
      dom.benchmarkBody.innerHTML = `<p class="text-error">로드 실패: ${err.message}</p>`;
    }
  }

  async function downloadBenchmarkJson() {
    try {
      const data = await api('GET', '/api/benchmark');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xpipe_benchmark_${Date.now()}.json`;
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
      dom.sseStatus.title = 'SSE 연결됨';
    };

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        eventCount++;
        dom.ftEvents.textContent = eventCount;

        // 문서 상태 변경 이벤트 → 문서 목록 갱신
        if (data.event_type === 'stage_complete' ||
            data.event_type === 'stage_start' ||
            data.event_type === 'document_processed' ||
            data.event_type === 'error') {
          // 빠른 갱신을 위해 debounce
          clearTimeout(pollTimer);
          pollTimer = setTimeout(refreshDocuments, 200);
        }
      } catch (err) {
        // keepalive 등 무시
      }
    };

    eventSource.onerror = () => {
      dom.sseStatus.className = 'status-indicator disconnected';
      dom.sseStatus.title = 'SSE 연결 끊김 — 자동 재연결 시도 중';
    };
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
    } catch {
      return isoStr.slice(11, 19);
    }
  }

  // ---------------------------------------------------------------------------
  // 폴링 (SSE 보완용 — 3초마다)
  // ---------------------------------------------------------------------------
  function startPolling() {
    setInterval(async () => {
      // 처리 중인 문서가 있을 때만 폴링
      const hasActive = documents.some(d => d.status === 'queued' || d.status === 'processing');
      if (hasActive) {
        await refreshDocuments();
      }
    }, 3000);
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
    startPolling();

    // 초기 문서 목록 로드
    refreshDocuments();
  }

  // DOM 로드 후 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
