'use client'

import { useEffect, useRef, useState } from 'react'
import { ecosystemApi, EcosystemMapData } from '../../lib/api'
import { LAUNCHPAD_APP_URL, getHiddenPages } from '../../lib/auth'

// launchpad_v5's admin "Plan Features" panel can hide any of these three tabs per plan
// tier — key here must match the catalog in launchpad_v5's backend/src/config/satelliteNav.ts
// (SATELLITE_NAV_CATALOG.ecosystemOS). The graph/map view is never hideable.
const HIDEABLE_TAB_ELEMENT_IDS: Record<string, string[]> = {
  discovery: ['tab-discovery'],
  versions: ['tab-versions'],
  usage: ['sidebar-usage-btn'],
}

// Ported from launchpad_v5's frontend/src/pages/ecosystem/index.tsx. That page's
// ~1600-line vanilla-JS engine (ECO_CSS/ECO_HTML/ECO_JS below) never touches React,
// a store, or an API client directly — it only calls window.__ecoBridge.load()/save()
// and reads window.__startupContext, both set up here. That's why the engine itself
// needed almost no changes to move from launchpad's Zustand store to this app's own
// backend: only the API_BASE/authToken() lines inside ECO_JS were repointed.
export default function EcosystemMapperPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const dataRef = useRef<EcosystemMapData | null>(null)

  // Fetch first — ECO_HTML below only renders once this resolves, so the script
  // (next effect) injects into a DOM that already has #eco-root's markup painted.
  useEffect(() => {
    let cancelled = false

    ecosystemApi.getMap().then(res => {
      if (cancelled) return
      dataRef.current = res.data
      setState('ready')
    }).catch((e) => {
      if (cancelled) return
      setErrorMsg(e.response?.data?.error || 'Could not load your ecosystem map.')
      setState('error')
    })

    return () => { cancelled = true }
  }, [])

  // Only runs once `state === 'ready'` has actually rendered ECO_HTML into the DOM —
  // the original launchpad_v5 page relied on that same ordering (its effect ran after
  // an unconditional render of #eco-root, never before it).
  useEffect(() => {
    if (state !== 'ready' || !dataRef.current) return

    ;(window as any).__startupContext = dataRef.current.startup
    ;(window as any).__maxLayers = dataRef.current.maxLayers

    ;(window as any).__ecoBridge = {
      load: () => dataRef.current?.ecosystemMaps || [],
      save: (list: unknown[]) => {
        if (dataRef.current) dataRef.current.ecosystemMaps = list
        ecosystemApi.saveMap(list).catch(() => {})
      },
    }

    // Real <script> tag (not a closure) so the engine's top-level function/var
    // declarations attach to `window` — the inline onclick="selLayer(...)" handlers
    // in ECO_HTML resolve against global scope.
    const script = document.createElement('script')
    script.textContent = ECO_JS
    document.body.appendChild(script)

    const s = dataRef.current.startup
    const hasData = !!(s.name || s.problem || s.solution)
    ;(window as any).setDataSource?.(hasData ? 'auto' : 'manual')

    const hiddenPages = getHiddenPages()
    for (const [key, elementIds] of Object.entries(HIDEABLE_TAB_ELEMENT_IDS)) {
      if (!hiddenPages.includes(key)) continue
      for (const elId of elementIds) {
        const el = document.getElementById(elId)
        if (el) el.style.display = 'none'
      }
    }

    // Lock out layer options past the plan's maxLayers — same "never fully hide a
    // gated option, show it locked with an upgrade path" convention launchpad_v5 uses.
    // The 10-layer button is the default `active` one in the static markup above; if
    // that's locked for this plan, fall back to the 5-layer option so the page never
    // loads with a locked option selected.
    const maxLayers = dataRef.current.maxLayers
    for (const n of [5, 10, 20]) {
      if (n <= maxLayers) continue
      const btn = document.getElementById(`layer-btn-${n}`)
      if (btn) btn.classList.add('locked')
    }
    if (maxLayers < 10) {
      const fiveBtn = document.getElementById('layer-btn-5') as HTMLButtonElement | null
      fiveBtn?.click()
    }

    return () => {
      document.body.removeChild(script)
      delete (window as any).__ecoBridge
      delete (window as any).__startupContext
      delete (window as any).__maxLayers
    }
  }, [state])

  if (state === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, fontFamily: 'Inter, sans-serif', padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--red-text)' }}>{errorMsg}</p>
        <a href={`${LAUNCHPAD_APP_URL}/dashboard`} className="btn btn-primary">← Back to Founder OS</a>
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ECO_CSS }} />
      <div
        id="eco-root"
        dangerouslySetInnerHTML={{ __html: ECO_HTML }}
        style={{ height: '100vh', overflow: 'hidden' }}
      />
    </>
  )
}
const ECO_CSS = `

:root{--navy:#0D2137;--navy2:#1B3A5C;--orange:#C94F1C;--teal:#0E7E72;--ink:#1A1A2E;--mid:#6B7280;--border:#E5E7EB;--paper:#F9F7F4;--white:#FFFFFF;--red:#EF4444;--shadow:0 1px 4px rgba(0,0,0,.09)}
*{box-sizing:border-box;margin:0;padding:0}
#eco-root{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased}
#app{display:flex;flex-direction:column;height:100%}
#main-content{flex:1;overflow:hidden;display:flex;flex-direction:column;position:relative}
.view{display:none;flex:1;overflow:hidden;flex-direction:column}
.view.active{display:flex}
/* INPUT */
#view-input{align-items:center;justify-content:center;padding:32px 20px;overflow-y:auto}
#input-card{background:var(--white);border:1px solid var(--border);border-radius:14px;padding:32px;width:100%;max-width:680px;box-shadow:var(--shadow)}
.eyebrow{font-size:11px;font-family:monospace;color:var(--orange);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.field{margin-bottom:14px}
.field label{display:block;font-size:11px;font-family:monospace;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.req{color:var(--orange)}
.field input,.field textarea,.field select{width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:7px;font-size:13px;font-family:inherit;background:var(--white);color:var(--ink);outline:none;transition:border-color .15s}
.field input:focus,.field textarea:focus{border-color:var(--orange)}
.field textarea{resize:vertical;line-height:1.6}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.src-toggle{display:flex;gap:10px}
.src-btn{flex:1;padding:10px 8px;border:2px solid var(--border);background:var(--white);border-radius:9px;cursor:pointer;text-align:center;font-family:inherit;font-size:12px;font-weight:700;color:var(--navy);transition:all .15s}
.src-btn.active{border-color:var(--orange);background:#FFF5F0;color:var(--orange)}
.src-banner{font-size:11px;color:var(--teal);background:rgba(14,126,114,.08);border:1px solid rgba(14,126,114,.25);border-radius:6px;padding:7px 10px;margin-top:8px}
.src-banner.hidden{display:none}
.layer-selector{display:flex;gap:10px;margin-bottom:22px}
.layer-btn{flex:1;padding:12px 8px;border:2px solid var(--border);background:var(--white);border-radius:9px;cursor:pointer;text-align:center;font-family:inherit;transition:all .15s}
.layer-btn.active{border-color:var(--orange);background:#FFF5F0}
.layer-btn .lb-icon{font-size:18px;margin-bottom:3px}
.layer-btn .lb-title{font-size:12px;font-weight:700;color:var(--navy)}
.layer-btn .lb-sub{font-size:10px;color:var(--mid)}
.layer-btn.active .lb-title{color:var(--orange)}
.layer-btn.locked{cursor:not-allowed;opacity:.55;background:var(--paper)}
.layer-btn.locked .lb-sub{color:var(--orange);font-weight:700}
.generate-btn{width:100%;padding:13px;background:var(--orange);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s}
.generate-btn:hover{background:#E8602A}
.generate-btn:disabled{background:var(--border);color:var(--mid);cursor:not-allowed}
/* GENERATING */
#view-generating{align-items:center;justify-content:center;flex-direction:column}
.gen-card{background:var(--white);border:1px solid var(--border);border-radius:14px;padding:36px 40px;width:100%;max-width:520px;text-align:center;box-shadow:var(--shadow)}
.gen-spinner{width:44px;height:44px;border:4px solid #E5E7EB;border-top-color:var(--orange);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 18px}
@keyframes spin{to{transform:rotate(360deg)}}
.gen-stage{font-size:13px;color:var(--mid);margin-bottom:14px;min-height:20px}
.gen-progress-bar{width:100%;height:8px;background:var(--border);border-radius:4px;overflow:hidden}
.gen-progress-fill{height:100%;background:var(--orange);border-radius:4px;transition:width .5s ease}
.gen-log{text-align:left;margin-top:18px;max-height:100px;overflow-y:auto;font-size:11px;font-family:monospace;color:var(--mid);line-height:1.8}
/* TOOLBAR */
#graph-toolbar{background:var(--white);border-bottom:1px solid var(--border);padding:7px 12px;display:flex;align-items:center;gap:7px;flex-shrink:0;flex-wrap:wrap;z-index:50}
.tb-sep{width:1px;height:20px;background:var(--border)}
.tb-btn{padding:4px 11px;border-radius:5px;border:1px solid var(--border);background:var(--white);color:var(--mid);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap}
.tb-btn:hover{border-color:var(--navy);color:var(--navy)}
.tb-btn.active{background:var(--navy);color:var(--white);border-color:var(--navy)}
.tb-btn.teal{background:var(--teal);color:var(--white);border-color:var(--teal)}
.tb-stats{display:flex;gap:10px;font-size:11px;color:var(--mid)}
#search-input,#geo-filter{padding:4px 9px;border:1px solid var(--border);border-radius:5px;font-size:11px;font-family:inherit;width:120px;outline:none}
#search-input:focus,#geo-filter:focus{border-color:var(--orange)}
/* CAT + LAYER BARS */
#cat-bar,#layer-bar{background:var(--white);border-bottom:1px solid var(--border);padding:4px 12px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;flex-shrink:0}
.cat-chip,.layer-chip{font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid;cursor:pointer;font-weight:600;transition:all .1s;font-family:inherit}
.cat-chip{border-color:var(--navy);background:var(--navy);color:var(--white)}
.cat-chip.hidden{border-color:var(--border);background:var(--paper);color:var(--mid);text-decoration:line-through}
.layer-chip{border-color:var(--teal);background:rgba(14,126,114,.1);color:var(--teal)}
.layer-chip.collapsed{border-color:var(--border);background:var(--paper);color:var(--mid)}
.bar-label{font-size:10px;font-family:monospace;color:var(--mid);text-transform:uppercase;margin-right:3px;white-space:nowrap}
.bar-clear{font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid var(--border);background:none;color:var(--mid);cursor:pointer;margin-left:auto;font-family:inherit}
/* GRAPH WORKSPACE */
#graph-workspace{flex:1;display:flex;overflow:hidden;position:relative}
#graph-canvas{flex:1;background:#F0F2F5;position:relative;overflow:hidden}
#graph-svg{width:100%;height:100%;cursor:grab;user-select:none}
#graph-svg.panning,#graph-svg.dragging{cursor:grabbing}
#graph-controls{position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:5px;z-index:20}
.gctrl{width:30px;height:30px;border-radius:6px;border:1px solid var(--border);background:var(--white);cursor:pointer;font-size:14px;font-weight:700;color:var(--navy);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.06);font-family:inherit}
.gctrl:hover{border-color:var(--orange);color:var(--orange)}
.gctrl.active{background:var(--orange);color:var(--white);border-color:var(--orange)}
#graph-stats-badge{position:absolute;top:10px;left:10px;background:var(--white);border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:11px;color:var(--mid);z-index:20}
#graph-legend{position:absolute;bottom:10px;left:10px;background:var(--white);border:1px solid var(--border);border-radius:8px;padding:9px 12px;font-size:10px;z-index:20}
.leg-row{display:flex;align-items:center;gap:5px;margin-bottom:3px}
.leg-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.leg-sep{border-top:1px solid var(--border);margin:4px 0}
/* DETAIL PANEL */
#detail-panel{width:400px;background:var(--white);border-left:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;overflow:hidden;box-shadow:-3px 0 16px rgba(0,0,0,.07);z-index:30}
#detail-panel.hidden{display:none}
#dp-header{padding:14px 16px 10px;border-bottom:1px solid var(--border);background:var(--paper);flex-shrink:0}
#dp-name-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px}
#dp-meta{font-size:10px;font-family:monospace;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
#dp-name{font-size:15px;font-weight:800;color:var(--navy);line-height:1.3;display:flex;align-items:center;gap:6px}
#dp-close{background:none;border:none;font-size:20px;cursor:pointer;color:var(--mid);line-height:1;padding:2px;font-family:inherit}
#dp-badges{display:flex;gap:4px;flex-wrap:wrap}
.badge{font-size:10px;padding:2px 7px;border-radius:3px;font-family:monospace;font-weight:700}
#dp-scores{padding:9px 16px;background:#FAFAFA;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;flex-shrink:0}
.score-row{display:flex;flex-direction:column;gap:2px}
.score-label{font-size:9px;font-family:monospace;color:var(--mid);text-transform:uppercase}
.score-bar-wrap{display:flex;align-items:center;gap:6px}
.score-bar{flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden}
.score-fill{height:100%;border-radius:3px}
.score-val{font-size:11px;font-family:monospace;font-weight:700;min-width:22px}
#dp-formula{font-size:9px;color:var(--mid);grid-column:1/-1;line-height:1.4}
#dp-tabs{display:flex;border-bottom:1px solid var(--border);flex-shrink:0;overflow-x:auto;background:var(--white)}
.dp-tab{padding:7px 10px;border:none;background:none;cursor:pointer;font-size:11px;font-weight:500;color:var(--mid);border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap;font-family:inherit}
.dp-tab.active{color:var(--orange);font-weight:700;border-bottom-color:var(--orange)}
#dp-body{flex:1;overflow-y:auto;padding:14px 16px}
.dp-section{margin-bottom:14px}
.dp-section-title{font-size:10px;font-family:monospace;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.why-box{background:#FFF5F0;border:1px solid #FECACA;border-radius:7px;padding:9px 12px;font-size:13px;color:var(--ink);line-height:1.7}
.entity-box{background:var(--paper);border:1px solid var(--border);border-radius:7px;padding:9px 12px;font-size:13px}
.target-box{background:#FFFBEB;border:1px solid #FDE68A;border-radius:7px;padding:9px 12px;font-size:12px;color:var(--ink);line-height:1.6}
.ev-item{background:var(--paper);border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:12px;color:var(--ink)}
.ev-meta{display:flex;justify-content:space-between;margin-bottom:3px;font-size:10px;font-family:monospace;color:var(--mid)}
.conn-item{background:var(--paper);border:1px solid var(--border);border-radius:7px;padding:9px 11px;margin-bottom:6px}
.conn-header{display:flex;align-items:center;gap:7px;margin-bottom:6px}
.conn-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.conn-name{font-size:13px;font-weight:600;color:var(--navy);flex:1}
.conn-select{width:100%;padding:4px 7px;border:1px solid var(--border);border-radius:5px;font-size:11px;background:var(--white);color:var(--ink);font-family:inherit}
.q-item{display:flex;gap:7px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--ink);line-height:1.5}
.q-num{color:var(--orange);font-weight:700;flex-shrink:0}
.ev-missing{background:#FFF5F0;border:1px solid #FECACA;border-radius:5px;padding:7px 9px;margin-bottom:8px;font-size:11px;color:#991B1B;line-height:1.5}
.also-chip{font-size:10px;background:var(--paper);border:1px solid var(--border);padding:2px 7px;border-radius:3px;color:var(--mid)}
.integrate-btn{width:100%;text-align:left;padding:11px 13px;background:var(--white);border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:8px;font-family:inherit;transition:border-color .15s}
.integrate-btn:hover{border-color:var(--teal)}
.ib-title{font-size:13px;font-weight:700;color:var(--navy);margin-bottom:2px}
.ib-desc{font-size:11px;color:var(--mid);line-height:1.4}
.research-out{background:var(--paper);border:1px solid var(--border);border-radius:7px;padding:12px;font-size:12px;color:var(--ink);line-height:1.7;white-space:pre-wrap;font-family:inherit;max-height:280px;overflow-y:auto}
#dp-footer{padding:11px 16px;border-top:1px solid var(--border);background:var(--paper);flex-shrink:0}
#dp-status-select{width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--white);margin-bottom:8px;cursor:pointer;font-family:inherit}
#dp-delete-btn{width:100%;padding:7px 0;background:var(--white);border:1px solid #FCA5A5;color:var(--red);border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;font-family:inherit;transition:all .2s}
/* inline edit */
.edit-trigger{background:none;border:none;cursor:pointer;color:var(--mid);font-size:12px;padding:2px;line-height:1}
.inline-input{width:100%;padding:5px 8px;border:1px solid var(--orange);border-radius:5px;font-size:14px;font-weight:700;font-family:inherit;color:var(--navy);outline:none}
.inline-textarea{width:100%;padding:7px 9px;border:1px solid var(--orange);border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;line-height:1.6;outline:none}
.edit-actions{display:flex;gap:5px;margin-top:5px}
.save-btn{padding:4px 12px;background:var(--orange);color:var(--white);border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit}
.cancel-btn{padding:4px 9px;background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:11px;color:var(--mid);font-family:inherit}
.notes-ta{width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;outline:none}
.notes-ta:focus{border-color:var(--orange)}
.notes-save-btn{margin-top:4px;padding:4px 12px;background:var(--navy);color:var(--white);border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit}
.add-ev-area{background:var(--paper);border:1px solid var(--border);border-radius:7px;padding:10px;margin-bottom:10px}
/* DISCOVERY VIEW */
#view-discovery{flex-direction:column;overflow:hidden}
#disc-toolbar{padding:12px 16px 8px;flex-shrink:0;border-bottom:1px solid var(--border);background:var(--white)}
#disc-body{flex:1;overflow-y:auto;padding:16px}
.disc-stats{display:flex;gap:10px;margin-bottom:14px}
.disc-stat{flex:1;background:var(--white);border:1px solid var(--border);border-radius:7px;padding:9px 10px;text-align:center}
.disc-stat-val{font-size:20px;font-weight:800}
.disc-stat-lbl{font-size:10px;font-family:monospace;color:var(--mid);text-transform:uppercase;margin-top:2px}
.disc-mode-toggle{display:flex;gap:5px;margin-bottom:12px}
.disc-mode-btn{padding:5px 12px;border-radius:5px;border:none;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;background:var(--paper);color:var(--mid)}
.disc-mode-btn.active{background:var(--navy);color:var(--white)}
.target-card{background:var(--white);border:1px solid var(--border);border-radius:9px;margin-bottom:8px;overflow:hidden}
.target-card-header{display:flex;align-items:center;gap:9px;padding:11px 13px;cursor:pointer}
.target-rank{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--white);font-weight:800;font-size:11px;flex-shrink:0}
.target-name{font-size:13px;font-weight:700;color:var(--navy)}
.target-cat{font-size:10px;font-family:monospace;color:var(--mid)}
.target-score{font-size:19px;font-weight:800;text-align:right;line-height:1}
.target-score-lbl{font-size:9px;font-family:monospace;font-weight:700}
.target-body{padding:0 13px 13px;border-top:1px solid var(--border)}
.target-section{margin-bottom:9px;padding-top:10px}
.target-section-title{font-size:10px;font-family:monospace;color:var(--mid);text-transform:uppercase;margin-bottom:4px}
.target-goto{font-size:11px;background:var(--navy);color:var(--white);border:none;border-radius:5px;padding:5px 12px;cursor:pointer;font-weight:600;font-family:inherit}
.bucket-hero{background:linear-gradient(135deg,var(--navy),var(--navy2));border-radius:9px;padding:14px 16px;margin-bottom:14px;color:var(--white)}
.bucket-hero h3{font-size:14px;font-weight:800;margin-bottom:3px}
.bucket-hero p{font-size:12px;color:rgba(255,255,255,.7);line-height:1.6}
.bucket-section{margin-bottom:12px}
.bucket-title{font-size:11px;font-weight:700;color:var(--navy);font-family:monospace;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:5px}
.bucket-title span{font-size:10px;color:var(--mid);font-weight:400}
.bucket-item{background:var(--white);border:1px solid var(--border);border-radius:7px;padding:9px 12px;margin-bottom:4px;display:flex;align-items:center;gap:9px;cursor:pointer}
.bucket-item:hover{border-color:var(--teal)}
.bucket-rank{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--white);font-weight:800;font-size:10px;flex-shrink:0}
.bucket-name{font-size:12px;font-weight:600;color:var(--navy);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bucket-meta{font-size:10px;font-family:monospace;color:var(--mid)}
/* VERSIONS */
#view-versions{overflow-y:auto;padding:20px}
.version-card{background:var(--white);border:1px solid var(--border);border-radius:9px;padding:14px 18px;margin-bottom:9px}
.version-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
.version-tag{font-weight:700;color:var(--navy);font-size:14px}
.version-date{font-size:11px;color:var(--mid);font-family:monospace}
/* MODALS */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
.modal-overlay.hidden{display:none}
.modal-box{background:var(--white);border-radius:12px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.modal-title{font-size:15px;font-weight:800;color:var(--navy);margin-bottom:16px}
.modal-actions{display:flex;gap:7px;margin-top:16px}
.modal-save{flex:1;padding:10px 0;background:var(--orange);color:var(--white);border:none;border-radius:7px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
.modal-save:disabled{background:var(--border);color:var(--mid);cursor:not-allowed}
.modal-cancel{padding:10px 18px;background:var(--white);border:1px solid var(--border);border-radius:7px;cursor:pointer;font-size:13px;color:var(--mid);font-weight:600;font-family:inherit}
.modal-preview{background:var(--paper);border:1px solid var(--border);border-radius:7px;padding:9px 12px;margin-bottom:10px;text-align:center;font-size:13px;color:var(--ink)}
.type-toggle{display:flex;gap:6px;margin-bottom:14px}
.type-btn{flex:1;padding:9px;border:2px solid var(--border);background:var(--white);border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;transition:all .15s}
.type-btn.active{border-color:var(--orange);background:#FFF5F0;color:var(--orange)}
/* ERROR + TOAST */
#error-banner{background:#FEE2E2;border-bottom:1px solid #FCA5A5;padding:9px 16px;font-size:13px;color:#991B1B;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
#error-banner.hidden{display:none}
#toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--navy);color:var(--white);padding:9px 18px;border-radius:7px;font-size:13px;font-weight:600;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none}
#toast.show{opacity:1}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}

/* ── HISTORY SIDEBAR ── */
#app{flex-direction:row!important}
#app-left{width:250px;flex-shrink:0;background:#0D2137;display:flex;flex-direction:column;height:100%;border-right:1px solid rgba(255,255,255,.08)}
#app-right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
#hist-header{padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}
#hist-logo{background:#C94F1C;color:#fff;font-weight:800;font-size:11px;padding:4px 9px;border-radius:4px;letter-spacing:.04em;display:inline-block;margin-bottom:10px}
#hist-title{color:rgba(255,255,255,.9);font-size:13px;font-weight:700;margin-bottom:2px}
#hist-sub{color:rgba(255,255,255,.35);font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:.06em}
#back-to-dashboard{margin:10px 10px 0;padding:7px 10px;border-radius:7px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.6);font-size:11px;font-weight:600;text-align:center;display:block;text-decoration:none;transition:all .15s}
#back-to-dashboard:hover{background:rgba(255,255,255,.12);color:#fff}
#hist-actions{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;gap:6px;flex-shrink:0}
.habt{flex:1;padding:7px 0;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:rgba(255,255,255,.8);font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;text-align:center;transition:all .15s}
.habt:hover{background:rgba(255,255,255,.13)}
.habt.hn{background:#C94F1C;border-color:#C94F1C;color:#fff}
.habt.hn:hover{background:#E8602A}
#hist-list{flex:1;overflow-y:auto;padding:7px}
#hist-list::-webkit-scrollbar{width:3px}
#hist-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:2px}
.hi{padding:10px 11px;border-radius:7px;cursor:pointer;margin-bottom:4px;border:1px solid transparent;transition:all .15s;position:relative}
.hi:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.1)}
.hi.ac{background:rgba(201,79,28,.18);border-color:rgba(201,79,28,.38)}
.hi-name{color:rgba(255,255,255,.88);font-size:12px;font-weight:600;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:18px}
.hi-meta{color:rgba(255,255,255,.32);font-size:10px;font-family:monospace;line-height:1.6}
.hi-del{position:absolute;top:8px;right:7px;background:none;border:none;color:rgba(255,255,255,.2);cursor:pointer;font-size:15px;line-height:1;padding:2px;transition:color .15s}
.hi:hover .hi-del{color:rgba(255,255,255,.4)}
.hi-del:hover{color:#EF4444!important}
#hist-empty{color:rgba(255,255,255,.28);font-size:12px;text-align:center;padding:30px 12px;line-height:1.8}


/* ── USAGE & BILLS VIEW ── */
#view-usage{overflow-y:auto;padding:0}
.usage-wrap{max-width:860px;margin:0 auto;padding:24px 20px 60px}
.usage-hero{margin-bottom:22px}
.range-bar{display:flex;gap:6px;margin-bottom:20px}
.range-btn{padding:5px 13px;border-radius:6px;border:1px solid var(--border);background:white;color:var(--mid);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}
.range-btn.active{background:#FFF5F0;border-color:var(--orange);color:var(--orange)}
.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
.sum-card{background:white;border:1px solid var(--border);border-radius:10px;padding:16px 18px}
.sum-lbl{font-size:10px;font-family:monospace;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.sum-val{font-size:22px;font-weight:800;color:var(--navy);margin-bottom:3px}
.sum-sub{font-size:11px;color:var(--mid)}
.info-note{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px 14px;font-size:12px;color:#1E40AF;line-height:1.6;margin-bottom:16px}
.info-note a{color:#1D4ED8}
.u-card{background:white;border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:14px}
.u-card-title{font-size:13px;font-weight:700;color:var(--navy);margin-bottom:14px}
/* Chart */
.chart-bars{display:flex;align-items:flex-end;gap:3px;height:110px}
.chart-bar{flex:1;min-height:2px;background:var(--orange);border-radius:2px 2px 0 0;cursor:default;transition:opacity .15s}
.chart-bar:hover{opacity:.75}
.chart-bar.empty{background:var(--border)}
.chart-x{display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:var(--mid);font-family:monospace}
/* Feature breakdown */
.feat-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)}
.feat-row:last-child{border-bottom:none}
.feat-icon{font-size:16px;width:22px;text-align:center;flex-shrink:0}
.feat-info{flex:1;min-width:0}
.feat-name{font-size:13px;font-weight:600;color:var(--navy);text-transform:capitalize;margin-bottom:3px}
.feat-bar-wrap{height:5px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:3px}
.feat-bar-fill{height:100%;background:var(--orange);border-radius:3px}
.feat-meta{display:flex;justify-content:space-between;font-size:10px;color:var(--mid);font-family:monospace}
.feat-cost{font-size:13px;font-weight:700;color:var(--orange);font-family:monospace;flex-shrink:0}
/* Recent table */
.u-table{width:100%;border-collapse:collapse;font-size:12px}
.u-table th{padding:6px 10px;text-align:left;color:var(--mid);font-weight:600;font-size:10px;font-family:monospace;text-transform:uppercase;white-space:nowrap;border-bottom:1px solid var(--border)}
.u-table td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:middle}
.u-table tr:last-child td{border-bottom:none}
.status-ok{font-size:10px;padding:2px 7px;border-radius:3px;background:#D1FAE5;color:#065F46;font-family:monospace;font-weight:700}
.status-err{font-size:10px;padding:2px 7px;border-radius:3px;background:#FEE2E2;color:#991B1B;font-family:monospace;font-weight:700}
.usage-empty{text-align:center;padding:60px 0;color:var(--mid)}
/* Sidebar usage link */
#sidebar-usage-btn{margin:0 8px 6px;padding:8px 10px;border-radius:7px;border:none;background:rgba(255,255,255,.06);color:rgba(255,255,255,.6);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left;display:flex;align-items:center;gap:7px;transition:all .15s;width:calc(100% - 16px)}
#sidebar-usage-btn:hover{background:rgba(255,255,255,.12);color:white}
#sidebar-usage-btn.active-usage{background:rgba(201,79,28,.2);color:white}


/* ── Next.js integration fixes ─────────── */
#eco-root #app { height: 100%; }
`

const ECO_HTML = `
<div id="app">
<div id="app-left">
  <div id="hist-header">
    <div id="hist-logo">LP</div>
    <div id="hist-title">Ecosystem Mapper</div>
    <div id="hist-sub">LaunchPad AI</div>
  </div>
  <a id="back-to-dashboard" href="${process.env.NEXT_PUBLIC_LAUNCHPAD_APP_URL || 'http://localhost:3000'}/dashboard">&larr; Back to Dashboard</a>
  <div id="hist-actions">
    <button class="habt hn" onclick="startNew()">&#10024; New</button>
    <label class="habt" style="cursor:pointer">&#11014; Import<input type="file" id="imp-file" accept=".json" style="display:none" onchange="importEco(this)"/></label>
  </div>
  <div id="hist-list"></div>
  <div style="border-top:1px solid rgba(255,255,255,.08);padding:8px 0 4px">
    <button id="sidebar-usage-btn" onclick="showUsageView()">&#128202; Usage &amp; Bills</button>
  </div>
</div>
<div id="app-right">
<div id="error-banner" class="hidden">
  <span id="error-msg"></span>
  <button onclick="dismissError()" style="background:none;border:none;cursor:pointer;color:#991B1B;font-size:18px">×</button>
</div>
<div id="main-content">

<!-- INPUT VIEW -->
<div class="view active" id="view-input">
<div id="input-card">
  <div class="eyebrow">🌐 Ecosystem Intelligence</div>
  <h1 style="font-size:24px;font-weight:800;color:var(--navy);margin-bottom:6px">Startup Ecosystem Mapper</h1>
  <p style="color:var(--mid);font-size:13px;line-height:1.7;margin-bottom:22px">Enter your startup idea and generate a layered knowledge graph of every stakeholder, supplier, partner, regulator, and competitor — including real-world organizations.</p>
  <div class="field">
    <label>Data Source</label>
    <div class="src-toggle">
      <button class="src-btn" id="src-auto" onclick="setDataSource('auto')">🔄 Auto-fill from my startup</button>
      <button class="src-btn" id="src-manual" onclick="setDataSource('manual')">✍️ Enter manually</button>
    </div>
    <div class="src-banner hidden" id="src-banner"></div>
  </div>
  <div class="field">
    <label>Startup / Product Description <span class="req">*</span></label>
    <textarea id="inp-desc" rows="3" placeholder='e.g. "We manufacture BLDC motors for electric two-wheelers in India"'></textarea>
  </div>
  <div class="grid-2">
    <div class="field"><label>Industry <span class="req">*</span></label><input id="inp-ind" placeholder="e.g. EV Manufacturing, SaaS"/></div>
    <div class="field"><label>Geography <span class="req">*</span></label><input id="inp-geo" placeholder="e.g. India, USA"/></div>
    <div class="field"><label>Target Customer</label><input id="inp-cust" placeholder="e.g. EV OEMs"/></div>
    <div class="field"><label>Business Model</label><input id="inp-biz" placeholder="e.g. B2B manufacturing"/></div>
  </div>
  <div class="field"><label>Existing Assumptions</label><textarea id="inp-assume" rows="2" placeholder="Any assumptions to consider"></textarea></div>
  <div class="field"><label>Ecosystem Depth</label></div>
  <div class="layer-selector">
    <button class="layer-btn" id="layer-btn-5" onclick="selLayer(5,this)"><div class="lb-icon">🎯</div><div class="lb-title">5 Layers</div><div class="lb-sub">Quick overview</div></button>
    <button class="layer-btn active" id="layer-btn-10" onclick="selLayer(10,this)"><div class="lb-icon">🗺</div><div class="lb-title">10 Layers</div><div class="lb-sub">Standard</div></button>
    <button class="layer-btn" id="layer-btn-20" onclick="selLayer(20,this)"><div class="lb-icon">🌐</div><div class="lb-title">20 Layers</div><div class="lb-sub">Deep analysis</div></button>
  </div>
  <button class="generate-btn" onclick="generateEcosystem()">✨ Generate Ecosystem Map →</button>
  <p style="text-align:center;font-size:12px;color:var(--mid);margin-top:9px">Takes 1–3 minutes.</p>
</div>
</div>

<!-- GENERATING VIEW -->
<div class="view" id="view-generating">
<div class="gen-card">
  <div class="gen-spinner"></div>
  <div style="font-size:17px;font-weight:800;color:var(--navy);margin-bottom:7px">Building your ecosystem…</div>
  <div class="gen-stage" id="gen-stage">Initialising…</div>
  <div class="gen-progress-bar"><div class="gen-progress-fill" id="gen-progress" style="width:0%"></div></div>
  <div class="gen-log" id="gen-log"></div>
</div>
</div>

<!-- GRAPH VIEW -->
<div class="view" id="view-graph" style="flex-direction:column">
<div id="graph-toolbar">
  <div style="display:flex;gap:4px">
    <button class="tb-btn active" onclick="showMain('graph')" id="tab-graph">🗺 Graph</button>
    <button class="tb-btn" onclick="showMain('discovery')" id="tab-discovery">🎯 Targets (<span id="target-count">0</span>)</button>
    <button class="tb-btn" onclick="showMain('versions')" id="tab-versions">📋 History</button>
  </div>
  <div class="tb-sep"></div>
  <div style="display:flex;gap:4px" id="gmode-group">
    <button class="tb-btn active" onclick="setMode('all')" id="gm-all">All</button>
    <button class="tb-btn" onclick="setMode('concept')" id="gm-concept">Categories</button>
    <button class="tb-btn" onclick="setMode('entity')" id="gm-entity">Entities</button>
  </div>
  <div class="tb-sep"></div>
  <select id="verif-filter" onchange="applyFilters()" style="padding:4px 7px;border:1px solid var(--border);border-radius:5px;font-size:11px;font-family:inherit">
    <option value="all">All evidence</option>
    <option value="verified">✅ Verified</option>
    <option value="inferred">🔍 Inferred</option>
  </select>
  <select id="layer-filter" onchange="applyFilters()" style="padding:4px 7px;border:1px solid var(--border);border-radius:5px;font-size:11px;font-family:inherit">
    <option value="">All layers</option>
  </select>
  <input id="geo-filter" placeholder="Geo…" oninput="applyFilters()"/>
  <input id="search-input" placeholder="Search…" oninput="applyFilters()"/>
  <div class="tb-stats" style="margin-left:auto">
    <span id="stat-c">🔵 0</span><span id="stat-e">🟢 0</span><span id="stat-t">🎯 0</span>
  </div>
  <div style="display:flex;gap:5px">
    <button class="tb-btn teal" onclick="showAddNode()">+ Node</button>
    <button class="tb-btn teal" onclick="showConnect()">+ Edge</button>
    <button class="tb-btn" onclick="exportGraph()">⬇ Export</button>
    <button class="tb-btn" onclick="renameEco()" title="Rename">✏️ Rename</button>
    <button class="tb-btn" onclick="startNew()">↺ New</button>
  </div>
</div>
<div id="cat-bar"><span class="bar-label">Show:</span><div id="cat-chips"></div><button class="bar-clear" onclick="showAllCats()">Show all</button></div>
<div id="layer-bar"><span class="bar-label">Layers:</span><div id="layer-chips"></div><button class="bar-clear" onclick="expandAll()">Expand all</button></div>
<div id="graph-workspace">
  <div id="graph-canvas">
    <div id="graph-stats-badge">0 nodes · 0 edges</div>
    <div id="graph-controls">
      <button class="gctrl" onclick="zoomIn()">+</button>
      <button class="gctrl" onclick="zoomOut()">−</button>
      <button class="gctrl" onclick="fitView()" style="font-size:10px">⊞</button>
      <button class="gctrl" id="el-btn" onclick="toggleEdgeLabels()">E</button>
    </div>
    <div id="graph-legend">
      <div style="font-weight:700;color:var(--navy);margin-bottom:6px;font-family:monospace;text-transform:uppercase;font-size:9px">Legend</div>
      <div class="leg-row"><div class="leg-dot" style="background:#C94F1C"></div><span style="font-size:10px">Startup</span></div>
      <div class="leg-row"><div class="leg-dot" style="background:#0D2137"></div><span style="font-size:10px">Category</span></div>
      <div class="leg-row"><div class="leg-dot" style="background:#0E7E72"></div><span style="font-size:10px">Entity</span></div>
      <div class="leg-sep"></div>
      <div class="leg-row"><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#9CA3AF" stroke-width="1.5"/></svg><span style="font-size:10px">✓ Verified</span></div>
      <div class="leg-row"><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#9CA3AF" stroke-width="1.5" stroke-dasharray="5,3"/></svg><span style="font-size:10px">~ Inferred</span></div>
      <div class="leg-row"><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#9CA3AF" stroke-width="1.5" stroke-dasharray="2,5"/></svg><span style="font-size:10px">? Assumed</span></div>
    </div>
    <svg id="graph-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arr-gray" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#9CA3AF"/></marker>
        <marker id="arr-orange" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#C94F1C"/></marker>
      </defs>
      <g id="graph-g"></g>
    </svg>
  </div>
  <!-- DETAIL PANEL -->
  <div id="detail-panel" class="hidden">
    <div id="dp-header">
      <div id="dp-name-row">
        <div><div id="dp-meta"></div><div id="dp-name"></div></div>
        <button id="dp-close" onclick="closePanel()">×</button>
      </div>
      <div id="dp-badges"></div>
    </div>
    <div id="dp-scores">
      <div class="score-row"><div class="score-label">Discovery Priority</div><div class="score-bar-wrap"><div class="score-bar"><div class="score-fill" id="sc-p" style="background:var(--orange)"></div></div><span class="score-val" id="sv-p" style="color:var(--orange)"></span></div></div>
      <div class="score-row"><div class="score-label">Relevance</div><div class="score-bar-wrap"><div class="score-bar"><div class="score-fill" id="sc-r" style="background:var(--teal)"></div></div><span class="score-val" id="sv-r" style="color:var(--teal)"></span></div></div>
      <div class="score-row"><div class="score-label">Importance</div><div class="score-bar-wrap"><div class="score-bar"><div class="score-fill" id="sc-i" style="background:var(--navy)"></div></div><span class="score-val" id="sv-i" style="color:var(--navy)"></span></div></div>
      <div class="score-row"><div class="score-label">Confidence</div><div class="score-bar-wrap"><div class="score-bar"><div class="score-fill" id="sc-c" style="background:#7C3AED"></div></div><span class="score-val" id="sv-c" style="color:#7C3AED"></span></div></div>
      <div id="dp-formula" class="dp-formula">Formula: relevance×35% + importance×25% + problem×20% + access×10% + confidence×10%</div>
    </div>
    <div id="dp-tabs">
      <button class="dp-tab active" onclick="dpTab('info')">ℹ️ Info</button>
      <button class="dp-tab" onclick="dpTab('questions')">❓ Q&A</button>
      <button class="dp-tab" onclick="dpTab('evidence')">🔍 Evidence</button>
      <button class="dp-tab" onclick="dpTab('connections')">🔗 Links</button>
      <button class="dp-tab" onclick="dpTab('research')">🔬 Research</button>
      <button class="dp-tab" onclick="dpTab('integrate')">🔗 Integrate</button>
    </div>
    <div id="dp-body"></div>
    <div id="dp-footer">
      <div style="font-size:10px;font-family:monospace;color:var(--mid);text-transform:uppercase;margin-bottom:5px">Discovery Status</div>
      <select id="dp-status" onchange="updateStatus(this.value)">
        <option value="NOT_RESEARCHED">Not Researched</option>
        <option value="RESEARCHING">Researching</option>
        <option value="INTERVIEW_TARGET">Interview Target</option>
        <option value="CONTACTED">Contacted</option>
        <option value="INTERVIEWED">Interviewed</option>
        <option value="VALIDATED">Validated ✅</option>
        <option value="REJECTED">Rejected ❌</option>
      </select>
      <button id="dp-delete-btn" onclick="confirmDel()">🗑 Remove Node</button>
    </div>
  </div>
</div>
</div>

<!-- DISCOVERY VIEW -->
<div class="view" id="view-discovery" style="flex-direction:column;overflow:hidden">
<div id="disc-toolbar">
  <div class="eyebrow">Customer Discovery</div>
  <h2 style="font-size:17px;font-weight:800;color:var(--navy);margin-bottom:8px">🎯 Discovery Targets</h2>
  <div style="display:flex;gap:7px;align-items:center">
    <div class="disc-mode-toggle">
      <button class="disc-mode-btn active" id="dm-ranked" onclick="setDiscMode('ranked')">📊 Ranked</button>
      <button class="disc-mode-btn" id="dm-bucketed" onclick="setDiscMode('bucketed')">👥 First 20 Conversations</button>
    </div>
    <button class="tb-btn" onclick="showMain('graph')" style="margin-left:auto">← Graph</button>
  </div>
</div>
<div id="disc-body"></div>
</div>

<!-- VERSIONS VIEW -->
<div class="view" id="view-versions" style="padding:20px;overflow-y:auto">
  <div class="eyebrow">Version History</div>
  <h2 style="font-size:17px;font-weight:800;color:var(--navy);margin-bottom:14px">Ecosystem Versions</h2>
  <div id="versions-list"></div>
  <button class="tb-btn" onclick="showMain('graph')" style="margin-top:8px">← Graph</button>
</div>


<!-- USAGE & BILLS VIEW -->
<div class="view" id="view-usage">
  <div class="usage-wrap">
    <div class="usage-hero">
      <div class="eyebrow">&#128202; Settings</div>
      <h1 style="font-size:22px;font-weight:800;color:var(--navy);margin-bottom:6px">API Usage &amp; Bills</h1>
      <p style="color:var(--mid);font-size:13px;line-height:1.6">Track your Anthropic API token consumption and estimated costs. All data is stored locally in your browser.</p>
    </div>
    <div class="range-bar">
      <button class="range-btn active" onclick="setUsageRange('7d',this)">Last 7 days</button>
      <button class="range-btn" onclick="setUsageRange('30d',this)">Last 30 days</button>
      <button class="range-btn" onclick="setUsageRange('all',this)">All time</button>
    </div>
    <div class="summary-grid">
      <div class="sum-card"><div class="sum-lbl">Total Cost (USD)</div><div class="sum-val" id="u-total-cost">$0.0000</div><div class="sum-sub" id="u-total-calls">0 API calls</div></div>
      <div class="sum-card"><div class="sum-lbl">Total Tokens</div><div class="sum-val" id="u-total-tokens">0</div><div class="sum-sub" id="u-token-split">0 in · 0 out</div></div>
      <div class="sum-card"><div class="sum-lbl">Avg Response Time</div><div class="sum-val" id="u-avg-latency">0ms</div><div class="sum-sub" id="u-latency-sub">across all calls</div></div>
    </div>
    <div class="info-note">
      &#8505;&#65039; Costs estimated at Anthropic list pricing: <strong>claude-sonnet-4-6 = $3/1M input · $15/1M output tokens</strong>. Check your <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">Anthropic Console</a> for exact charges.
    </div>
    <!-- Daily chart -->
    <div class="u-card" id="u-chart-card">
      <div class="u-card-title">Daily Cost (USD)</div>
      <div class="chart-bars" id="u-chart-bars"></div>
      <div class="chart-x" id="u-chart-x"></div>
    </div>
    <!-- By feature -->
    <div class="u-card" id="u-feat-card">
      <div class="u-card-title">Usage by Feature</div>
      <div id="u-feat-list"></div>
    </div>
    <!-- Recent calls -->
    <div class="u-card">
      <div class="u-card-title">Recent API Calls</div>
      <div style="overflow-x:auto">
        <table class="u-table">
          <thead><tr>
            <th>Feature</th><th>Stage</th><th>Tokens In</th><th>Tokens Out</th><th>Cost</th><th>Latency</th><th>Status</th><th>Time</th>
          </tr></thead>
          <tbody id="u-recent-body"></tbody>
        </table>
      </div>
      <div id="u-empty" class="usage-empty" style="display:none">
        <div style="font-size:38px;margin-bottom:10px">&#128202;</div>
        <div style="font-weight:700;color:var(--navy);margin-bottom:6px">No usage data yet</div>
        <div style="font-size:13px">API calls will appear here once you generate an ecosystem map.</div>
      </div>
    </div>
    <button class="tb-btn" onclick="showMain('graph')" style="margin-top:4px">&#8592; Back to Graph</button>
  </div>
</div>

</div><!-- main-content -->
</div><!-- app -->

<div id="toast"></div>

<!-- ADD NODE MODAL -->
<div class="modal-overlay hidden" id="add-node-modal" onclick="closeMod(event,'add-node-modal')">
<div class="modal-box" onclick="event.stopPropagation()">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div class="modal-title" style="margin:0">Add Node</div>
    <button onclick="hideMod('add-node-modal')" style="background:none;border:none;font-size:19px;cursor:pointer;color:var(--mid)">×</button>
  </div>
  <div class="type-toggle">
    <button class="type-btn active" id="nt-concept" onclick="setAddType('CONCEPT')">📂 Category</button>
    <button class="type-btn" id="nt-entity" onclick="setAddType('ENTITY')">🏢 Real Entity</button>
  </div>
  <div class="grid-2">
    <div class="field" style="grid-column:1/-1"><label>Name <span class="req">*</span></label><input id="an-name" placeholder="e.g. Procurement Manager"/></div>
    <div class="field"><label>Category <span class="req">*</span></label><input id="an-cat" placeholder="e.g. Direct Customer"/></div>
    <div class="field"><label>Layer</label><select id="an-layer"></select></div>
  </div>
  <div class="field"><label>Description</label><textarea id="an-desc" rows="2" placeholder="What does this stakeholder do?"></textarea></div>
  <div id="an-entity-fields" style="display:none">
    <div class="grid-2">
      <div class="field"><label>Entity Type</label>
        <select id="an-etype"><option>Company</option><option>Startup</option><option>Government</option><option>Regulator</option><option>OEM</option><option>Supplier</option><option>Distributor</option><option>Manufacturer</option><option>IndustryAssociation</option><option>University</option><option>Other</option></select>
      </div>
      <div class="field"><label>Geography</label><input id="an-geo2" placeholder="e.g. India"/></div>
      <div class="field" style="grid-column:1/-1"><label>Website</label><input id="an-web" placeholder="https://..."/></div>
    </div>
  </div>
  <div class="modal-actions">
    <button class="modal-save" onclick="saveNode()">+ Add Node</button>
    <button class="modal-cancel" onclick="hideMod('add-node-modal')">Cancel</button>
  </div>
</div>
</div>

<!-- CONNECT MODAL -->
<div class="modal-overlay hidden" id="connect-modal" onclick="closeMod(event,'connect-modal')">
<div class="modal-box" onclick="event.stopPropagation()">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div class="modal-title" style="margin:0">Connect Nodes</div>
    <button onclick="hideMod('connect-modal')" style="background:none;border:none;font-size:19px;cursor:pointer;color:var(--mid)">×</button>
  </div>
  <div class="field"><label>Source Node <span class="req">*</span></label><select id="cn-src" onchange="updConnPrev()"><option value="">Select…</option></select></div>
  <div class="field"><label>Relationship</label>
    <select id="cn-rel" onchange="updConnPrev()">
      <option>SELLS_TO</option><option>BUYS_FROM</option><option>SUPPLIES</option><option>USES</option><option>DISTRIBUTES</option>
      <option>PARTNERS_WITH</option><option>COMPETES_WITH</option><option>REGULATES</option><option>ENABLES</option><option>DEPENDS_ON</option>
      <option>SERVES</option><option>INTEGRATES_WITH</option><option>REPLACES</option><option>COMPLEMENTS</option>
      <option>POTENTIAL_CUSTOMER</option><option>POTENTIAL_SUPPLIER</option><option>CERTIFIES</option><option>MEMBER_OF</option>
    </select>
  </div>
  <div class="field"><label>Target Node <span class="req">*</span></label><select id="cn-dst" onchange="updConnPrev()"><option value="">Select…</option></select></div>
  <div class="modal-preview hidden" id="conn-prev"></div>
  <div class="field"><label>Explanation</label><textarea id="cn-exp" rows="2" placeholder="Why does this relationship exist?"></textarea></div>
  <div class="field"><label>Strength: <span id="cn-sv">70%</span></label>
    <input type="range" id="cn-str" min="0" max="100" value="70" oninput="document.getElementById('cn-sv').textContent=this.value+'%'" style="width:100%"/>
  </div>
  <div class="modal-actions">
    <button class="modal-save" onclick="saveEdge()">Connect Nodes</button>
    <button class="modal-cancel" onclick="hideMod('connect-modal')">Cancel</button>
  </div>
</div>
</div>
`

const ECO_JS = `
// ═══════════════════════════════════════════════════════════
// CONFIG — AI calls go through this app's own backend (server-side
// ANTHROPIC_API_KEY), not a key pasted into the browser.
// ═══════════════════════════════════════════════════════════
var API_BASE='${process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3501'}';
function authToken(){return localStorage.getItem('ecosystemos_token')||'';}

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
var S={
  nodes:[],edges:[],layers:[],targets:[],versions:[],
  layerCount:10,graphMode:'all',discMode:'ranked',
  selNodeId:null,hiddenCats:new Set(),collapsedLayers:new Set(),
  nodePos:{},showEdgeLabels:false,
  pan:{x:0,y:0},zoom:0.72,isPanning:false,panStart:{x:0,y:0},
  draggingNode:null,hovNode:null,hovEdge:null,
  verifFilter:'all',layerFilter:'',geoFilter:'',searchQ:'',
  addType:'CONCEPT',dpTab:'info',delConfirm:false,
  researching:false,researchResult:null,
};
var INPUT={};
var SVG_W=960,SVG_H=860,CX=480,CY=430;
var LR=[0,120,210,295,370,440,505,565,620,670,715,755,790];
var NC={STARTUP:'#C94F1C',CONCEPT:'#0D2137',ENTITY:'#0E7E72'};
var VD={VERIFIED:'none',INFERRED:'6,4',ASSUMED:'3,6',UNKNOWN:'2,8'};
var VI={VERIFIED:'✓',INFERRED:'~',ASSUMED:'?',UNKNOWN:'○'};
var STATI={
  NOT_RESEARCHED:{bg:'#F3F4F6',c:'#6B7280',l:'Not Researched'},
  RESEARCHING:{bg:'#EFF6FF',c:'#1D4ED8',l:'Researching'},
  INTERVIEW_TARGET:{bg:'#FEF3C7',c:'#92400E',l:'Interview Target'},
  CONTACTED:{bg:'#EDE9FE',c:'#6D28D9',l:'Contacted'},
  INTERVIEWED:{bg:'#DBEAFE',c:'#1E40AF',l:'Interviewed'},
  VALIDATED:{bg:'#D1FAE5',c:'#065F46',l:'Validated ✅'},
  REJECTED:{bg:'#FEE2E2',c:'#991B1B',l:'Rejected ❌'},
};
var VINFO={
  VERIFIED:{label:'Verified',icon:'✅',bg:'#D1FAE5',color:'#065F46'},
  INFERRED:{label:'Inferred',icon:'🔍',bg:'#EFF6FF',color:'#1E40AF'},
  ASSUMED:{label:'Assumed',icon:'💭',bg:'#FEF3C7',color:'#92400E'},
  UNKNOWN:{label:'Unknown',icon:'❓',bg:'#F3F4F6',color:'#6B7280'},
};
var RELS=['SELLS_TO','BUYS_FROM','SUPPLIES','USES','DISTRIBUTES','PARTNERS_WITH',
  'COMPETES_WITH','REGULATES','ENABLES','DEPENDS_ON','SERVES','INTEGRATES_WITH',
  'REPLACES','COMPLEMENTS','POTENTIAL_CUSTOMER','POTENTIAL_SUPPLIER','CERTIFIES','MEMBER_OF'];

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function el(id){return document.getElementById(id);}
function showToast(msg){var t=el('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}
function showError(msg){el('error-msg').textContent=msg;el('error-banner').classList.remove('hidden');}
function dismissError(){el('error-banner').classList.add('hidden');}
function showView(id){document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));el(id).classList.add('active');}
function closeMod(e,id){if(e.target===e.currentTarget)hideMod(id);}
function hideMod(id){el(id).classList.add('hidden');}
function getLR(l){return LR[Math.min(l,LR.length-1)];}

// ═══════════════════════════════════════════════════════════
// AI PIPELINE
// ═══════════════════════════════════════════════════════════
function setDataSource(mode){
  var ctx=window.__startupContext||{};
  var hasData=!!(ctx.name||ctx.problem||ctx.solution);
  if(mode==='auto'&&!hasData){showToast('No startup data to auto-fill yet — set up your startup profile first');mode='manual';}
  el('src-auto').classList.toggle('active',mode==='auto');
  el('src-manual').classList.toggle('active',mode==='manual');
  var desc=el('inp-desc'),ind=el('inp-ind'),geo=el('inp-geo'),cust=el('inp-cust'),biz=el('inp-biz'),banner=el('src-banner');
  if(mode==='auto'){
    desc.value=ctx.name?(ctx.name+' — '+(ctx.problem||ctx.solution||'')):(ctx.problem||ctx.solution||'');
    ind.value=ctx.market||'';
    geo.value='India';
    cust.value=ctx.segment||'';
    biz.value=ctx.stage||'';
    banner.textContent='✓ Auto-filled from "'+(ctx.name||'your startup')+'" — edit any field below before generating.';
    banner.classList.remove('hidden');
  }else{
    desc.value='';ind.value='';geo.value='';cust.value='';biz.value='';
    banner.classList.add('hidden');
  }
  window.__dataSourceMode=mode;
}
function selLayer(n,btn){
  if(n>(window.__maxLayers||20)){showToast('Upgrade to Standard or higher to unlock '+n+'-layer depth');return;}
  S.layerCount=n;
  document.querySelectorAll('.layer-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

async function callClaude(prompt,system,maxTokens){
  maxTokens=maxTokens||2500;
  var payload={
    system:system+'\\n\\nRespond ONLY with valid JSON. No markdown, no backticks, no extra text.',
    prompt:prompt, maxTokens:maxTokens, layerCount:S.layerCount};
  var _startMs=Date.now();
  var _stage=arguments[3]||'';
  var res;
  try{
    res=await fetch(API_BASE+'/api/ai/raw',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken()},
      body:JSON.stringify(payload)
    });
  }catch(netErr){
    throw new Error('Network error: cannot reach Founder OS backend. Check your internet connection. Detail: '+netErr.message);
  }
  var data;
  try{data=await res.json();}catch(e){throw new Error('Invalid response from server (status '+res.status+')');}
  if(!res.ok){
    var msg=data&&data.error?data.error:'HTTP '+res.status;
    if(res.status===401)throw new Error('Your session expired — sign in again.');
    if(res.status===429)throw new Error('Rate limit hit (429). Wait a moment and try again.');
    if(res.status===500)throw new Error('Server error (500). Try again in a few seconds.');
    throw new Error('API error '+res.status+': '+msg);
  }
  if(!data.text)throw new Error('Empty response from Claude');
  var raw=data.text;
  // Strip markdown code fences if present
  raw=raw.replace(/^\`\`\`json\\s*/i,'').replace(/^\`\`\`\\s*/,'').replace(/\\s*\`\`\`$/,'').trim();
  // Find first { or [ in case of any preamble
  var start=raw.search(/[\\[{]/);
  if(start>0)raw=raw.slice(start);
  trackApiCall({feature:'ecosystem',stage:_stage,inputTokens:data.inputTokens||0,outputTokens:data.outputTokens||0,latencyMs:Date.now()-_startMs,success:true});
  return raw;
}

// Claude sometimes hits max_tokens mid-object on large (20-layer) graphs,
// leaving an unterminated string. Salvage the last complete top-level
// array element instead of failing the whole generation.
function parseJsonSafe(raw){
  try{ return JSON.parse(raw); }
  catch(e){
    try{ return JSON.parse(repairTruncatedJson(raw)); }
    catch(e2){ throw new Error('The AI response was cut off before it finished. Try again, or pick a lower layer count.'); }
  }
}
function repairTruncatedJson(s){
  var BACKSLASH=String.fromCharCode(92);
  var inStr=false,esc=false,stack=[],lastGood=-1,i,c;
  for(i=0;i<s.length;i++){
    c=s[i];
    if(inStr){
      if(esc){esc=false;}
      else if(c===BACKSLASH){esc=true;}
      else if(c==='"'){inStr=false;}
      continue;
    }
    if(c==='"'){inStr=true;continue;}
    if(c==='{'||c==='['){stack.push(c);}
    else if(c==='}'||c===']'){stack.pop();if(stack.length<=1)lastGood=i;}
  }
  if(lastGood===-1)throw new Error('unrepairable');
  var truncated=s.slice(0,lastGood+1);
  var stack2=[];inStr=false;esc=false;
  var j,c2;
  for(j=0;j<truncated.length;j++){
    c2=truncated[j];
    if(inStr){
      if(esc){esc=false;}
      else if(c2===BACKSLASH){esc=true;}
      else if(c2==='"'){inStr=false;}
      continue;
    }
    if(c2==='"'){inStr=true;continue;}
    if(c2==='{'||c2==='['){stack2.push(c2);}
    else if(c2==='}'||c2===']'){stack2.pop();}
  }
  var closer=stack2.slice().reverse().map(function(ch){return ch==='{'?'}':']';}).join('');
  return truncated+closer;
}

function logGen(msg){var d=el('gen-log');d.innerHTML+=msg+'<br>';d.scrollTop=d.scrollHeight;}
function setStage(msg,pct){el('gen-stage').textContent=msg;el('gen-progress').style.width=pct+'%';}

function scoreNode(n){
  if(n.nodeType==='STARTUP'){n.discoveryPriority=0;return n;}
  var prob=n.layer<=2?80:n.layer<=5?60:40;
  var acc=n.nodeType==='ENTITY'?55:70;
  n.discoveryPriority=Math.min(100,Math.max(0,Math.round(
    n.relevanceScore*0.35+n.importanceScore*0.25+prob*0.20+acc*0.10+n.confidence*100*0.10
  )));
  return n;
}
// Resumable draft — persisted to localStorage after every individual AI call
// succeeds, so a 502/network blip (common on 20-layer runs with large prompts)
// doesn't throw away stages that already cost real API tokens. Calling
// generateEcosystem() again reuses every cached stage and only pays for the
// ones that never completed. Keyed by the exact input so changing the
// description/industry/geography/layer count starts a clean run instead of
// mixing stale cached stages with a different request.
var GEN_DRAFT_KEY='eco_gen_draft';
function loadGenDraft(){try{return JSON.parse(localStorage.getItem(GEN_DRAFT_KEY)||'null');}catch(e){return null;}}
function saveGenDraft(d){try{localStorage.setItem(GEN_DRAFT_KEY,JSON.stringify(d));}catch(e){}}
function clearGenDraft(){try{localStorage.removeItem(GEN_DRAFT_KEY);}catch(e){}}

async function generateEcosystem(){
  var desc=(el('inp-desc').value||'').trim();
  var ind=(el('inp-ind').value||'').trim();
  var geo=(el('inp-geo').value||'').trim();
  if(!desc||!ind||!geo){showToast('Description, industry, and geography are required');return;}
  INPUT={description:desc,industry:ind,geography:geo,
    targetCustomer:(el('inp-cust').value||'').trim(),
    businessModel:(el('inp-biz').value||'').trim(),
    assumptions:(el('inp-assume').value||'').trim()};

  var draft=loadGenDraft();
  var sameInput = draft && draft.desc===desc && draft.ind===ind && draft.geo===geo && draft.layerCount===S.layerCount;
  if(!sameInput) draft={desc:desc,ind:ind,geo:geo,layerCount:S.layerCount};

  S.nodes=[];S.edges=[];S.layers=[];S.targets=[];S.versions=[];S.nodePos={};
  showView('view-generating');el('gen-log').innerHTML='';
  if(sameInput && (draft.summary||draft.layers||draft.conceptNodes||draft.entityNodes||draft.targets)){
    logGen('⏩ Resuming a previous attempt — already-completed stages will not be re-run.');
  }
  try{
    // Stage 1: Understand
    var summary;
    if(sameInput && draft.summary){
      summary=draft.summary;
      logGen('✅ (cached) '+summary.slice(0,80)+'…');
    } else {
      setStage('Stage 1/5: Understanding your startup…',8);logGen('🔍 Analysing startup…');
      var raw1=await callClaude(
        'Startup: "'+desc+'"\\nIndustry: '+ind+'\\nGeography: '+geo+'\\nReturn JSON: {"summary":"2-3 sentence analysis of what this startup does, its value chain position, and primary market"}',
        'You are a startup analyst.',600);
      summary=parseJsonSafe(raw1).summary||desc;
      logGen('✅ '+summary.slice(0,80)+'…');
      draft.summary=summary;saveGenDraft(draft);
    }

    // Stage 2: Layers
    if(sameInput && draft.layers){
      S.layers=draft.layers;
      logGen('✅ (cached) '+S.layers.length+' layers');
    } else {
      setStage('Stage 2/5: Generating '+S.layerCount+' layers…',22);logGen('🗺 Building layers…');
      var raw2=await callClaude(
        'Startup: '+summary+'\\nProfile: '+JSON.stringify(INPUT)+'\\n\\nGenerate exactly '+S.layerCount+' ecosystem layers. Layer 0 is the startup. Make layers specific to this industry and geography.\\n\\nReturn JSON array of exactly '+S.layerCount+' objects:\\n[{"layer":0,"name":"The Startup","description":"...","categories":["Startup"],"priority":"HIGH"},{"layer":1,"name":"Direct Customers","description":"...","categories":["B2B Customer"],"priority":"HIGH"},...]',
        'Ecosystem architect. priority: HIGH|MEDIUM|LOW.',Math.min(4000,800+S.layerCount*150));
      var rawLayers=parseJsonSafe(raw2);
      S.layers=(Array.isArray(rawLayers)?rawLayers:[]).map(function(l,i){return{layer:typeof l.layer==='number'?l.layer:i,name:String(l.name||'Layer '+i),description:String(l.description||''),categories:Array.isArray(l.categories)?l.categories:[],priority:l.priority||'MEDIUM'};});
      logGen('✅ '+S.layers.length+' layers: '+S.layers.slice(1,4).map(function(l){return l.name;}).join(', ')+'…');
      draft.layers=S.layers;saveGenDraft(draft);
    }

    // Stage 3a: Concept nodes
    var conceptNodes;
    if(sameInput && draft.conceptNodes){
      conceptNodes=draft.conceptNodes;
      logGen('✅ (cached) '+conceptNodes.length+' categories');
    } else {
      setStage('Stage 3/5: Generating stakeholder categories…',38);logGen('👥 Building concept nodes…');
      var layerSummary=S.layers.map(function(l){return 'L'+l.layer+': '+l.name+' — '+l.description+' ['+l.categories.join(', ')+']';}).join('\\n');
      // More layers = more nodes per response, so ask for fewer nodes/layer
      // as layerCount grows and give the model a larger max_tokens budget —
      // otherwise the JSON gets cut off mid-string on 20-layer runs.
      var nodesPerLayerHint = S.layerCount>=20?'2':(S.layerCount>=10?'2-3':'3-5');
      var conceptTokens = S.layerCount>=20?8000:(S.layerCount>=10?6000:4000);
      var raw3=await callClaude(
        'Startup: '+summary+'\\nProfile: '+JSON.stringify(INPUT)+'\\nLayers:\\n'+layerSummary+'\\n\\nGenerate '+nodesPerLayerHint+' concept nodes per layer (skip layer 0). No real company names. Keep each description and whyItMatters under 15 words.\\nReturn JSON array:\\n[{"externalId":"concept_ev_oem","nodeType":"CONCEPT","category":"Direct Customer","name":"EV Two-Wheeler OEM","description":"OEMs producing electric two-wheelers who source BLDC motors","layer":1,"importanceScore":92,"relevanceScore":95,"confidence":0.9,"tags":["customer","oem"],"whyItMatters":"Primary buyers of BLDC motors","suggestedQuestions":["What motor specs do you source?","Who are your current suppliers?"]}]',
        'Ecosystem knowledge graph builder. importanceScore/relevanceScore: integers 0-100. confidence: float 0-1.',conceptTokens);
      conceptNodes=parseJsonSafe(raw3);
      if(!Array.isArray(conceptNodes))conceptNodes=[];
      logGen('✅ '+conceptNodes.length+' categories');
      draft.conceptNodes=conceptNodes;saveGenDraft(draft);
    }

    // Stage 3b: Relationships between concept nodes
    var conceptEdges;
    if(sameInput && draft.conceptEdges){
      conceptEdges=draft.conceptEdges;
      logGen('✅ (cached) '+conceptEdges.length+' edges');
    } else {
      setStage('Stage 3/5: Generating relationships…',48);logGen('🔗 Generating relationships…');
      var nodeList=conceptNodes.map(function(n){return n.externalId+': '+n.name+' (L'+n.layer+', '+n.category+')';}).join('\\n');
      var edgeTokens = conceptNodes.length>40?4500:2500;
      var raw4=await callClaude(
        'Startup summary: '+summary+'\\nNodes:\\n'+nodeList+'\\n\\nGenerate key relationships including from startup (externalId:"startup_core") to key nodes.\\nReturn JSON array:\\n[{"sourceExternalId":"startup_core","targetExternalId":"concept_ev_oem","relationshipType":"SELLS_TO","direction":"directed","strength":0.95,"confidence":0.9,"explanation":"Primary revenue channel","verifStatus":"INFERRED"}]\\nValid types: '+RELS.join(','),
        'Startup ecosystem analyst. verifStatus must be INFERRED for all AI-generated relationships.',edgeTokens);
      conceptEdges=parseJsonSafe(raw4);
      if(!Array.isArray(conceptEdges))conceptEdges=[];
      logGen('✅ '+conceptEdges.length+' edges');
      draft.conceptEdges=conceptEdges;saveGenDraft(draft);
    }

    // Stage 4: Entity discovery
    var entityNodes;
    if(sameInput && draft.entityNodes){
      entityNodes=draft.entityNodes;
      logGen('✅ (cached) '+entityNodes.length+' real entities');
    } else {
      setStage('Stage 4/5: Discovering real organizations…',66);logGen('🏢 Finding real-world entities…');
      var top=conceptNodes.slice().sort(function(a,b){return (b.relevanceScore||50)-(a.relevanceScore||50);}).slice(0,8);
      var topList=top.map(function(n){return n.externalId+': '+n.name+' ('+n.category+', L'+n.layer+')';}).join('\\n');
      var raw5=await callClaude(
        'Startup: '+summary+'\\nGeography: '+geo+'\\nIndustry: '+ind+'\\n\\nFind real organizations for these concept nodes:\\n'+topList+'\\n\\nCRITICAL: NEVER invent company relationships. ALL entities must be verifStatus:"INFERRED". Only include organizations you are confident exist.\\nReturn JSON array:\\n[{"externalId":"entity_bajaj","parentConceptId":"concept_ev_oem","nodeType":"ENTITY","category":"Direct Customer","name":"Bajaj Auto","description":"Indian two-wheeler OEM with EV portfolio (Chetak)","layer":1,"entityType":"OEM","geography":"India","website":"https://www.bajajauto.com","importanceScore":88,"relevanceScore":91,"confidence":0.75,"verifStatus":"INFERRED","tags":["oem","ev"],"whyItMatters":"Large Indian OEM with active EV program","suggestedQuestions":["What motor specs do you need?","Who approves new suppliers?"]}]',
        'Entity discovery engine. NEVER invent companies. confidence 0.5-0.75. verifStatus:"INFERRED" always.',3000);
      entityNodes=parseJsonSafe(raw5);
      if(!Array.isArray(entityNodes))entityNodes=[];
      logGen('✅ '+entityNodes.length+' real entities discovered');
      draft.entityNodes=entityNodes;saveGenDraft(draft);
    }

    // Build all nodes
    var ts=Date.now();
    var startupNode={id:'startup_core',externalId:'startup_core',nodeType:'STARTUP',category:'The Startup',name:desc.slice(0,55),description:desc,layer:0,importanceScore:100,relevanceScore:100,discoveryPriority:0,confidence:1,tags:['startup'],evidence:[],metadata:{},discoveryStatus:'NOT_RESEARCHED',whyItMatters:'The startup itself',suggestedQuestions:[],verifStatus:'VERIFIED',sourceUrls:[],entityType:null,website:null,geography:geo};
    var allConc=conceptNodes.map(function(n,i){return scoreNode({id:'c'+i+'_'+ts,externalId:String(n.externalId||'c'+i),nodeType:'CONCEPT',category:String(n.category||'Unknown'),name:String(n.name||'Node '+i),description:String(n.description||''),layer:typeof n.layer==='number'?n.layer:1,importanceScore:Math.min(100,Math.max(0,Number(n.importanceScore||50))),relevanceScore:Math.min(100,Math.max(0,Number(n.relevanceScore||50))),discoveryPriority:0,confidence:Math.min(1,Math.max(0,Number(n.confidence||0.5))),parentNodeId:null,tags:Array.isArray(n.tags)?n.tags:[],evidence:[{id:'ev'+i,type:'AI_REASONING',content:'AI-generated stakeholder category',confidence:Number(n.confidence||0.5),addedAt:new Date().toISOString()}],metadata:{},discoveryStatus:'NOT_RESEARCHED',whyItMatters:String(n.whyItMatters||''),suggestedQuestions:Array.isArray(n.suggestedQuestions)?n.suggestedQuestions:[],verifStatus:'INFERRED',sourceUrls:[],entityType:null,website:null,geography:null});});
    var allEnt=entityNodes.map(function(e,i){return scoreNode({id:'e'+i+'_'+ts,externalId:String(e.externalId||'e'+i),nodeType:'ENTITY',category:String(e.category||'Unknown'),name:String(e.name||'Entity '+i),description:String(e.description||''),layer:typeof e.layer==='number'?e.layer:1,importanceScore:Math.min(100,Math.max(0,Number(e.importanceScore||50))),relevanceScore:Math.min(100,Math.max(0,Number(e.relevanceScore||50))),discoveryPriority:0,confidence:Math.min(1,Math.max(0,Number(e.confidence||0.5))),parentNodeId:String(e.parentConceptId||''),tags:Array.isArray(e.tags)?e.tags:[],evidence:[{id:'eve'+i,type:'AI_REASONING',content:String(e.description||'').slice(0,280),confidence:Number(e.confidence||0.5),addedAt:new Date().toISOString()}],metadata:{},discoveryStatus:'NOT_RESEARCHED',whyItMatters:String(e.whyItMatters||''),suggestedQuestions:Array.isArray(e.suggestedQuestions)?e.suggestedQuestions:[],verifStatus:'INFERRED',sourceUrls:Array.isArray(e.sourceUrls)?e.sourceUrls:[],entityType:e.entityType||'Company',website:e.website||null,geography:e.geography||geo});});
    var allNodes=[startupNode].concat(allConc).concat(allEnt);

    // Build edges
    var extToId={};allNodes.forEach(function(n){extToId[n.externalId]=n.id;});
    var allEdges=[];
    conceptEdges.forEach(function(e,i){var s=extToId[e.sourceExternalId],d=extToId[e.targetExternalId];if(!s||!d)return;allEdges.push({id:'edge'+i+'_'+ts,sourceNodeId:s,targetNodeId:d,relationshipType:String(e.relationshipType||'SERVES'),direction:e.direction||'directed',strength:Math.min(1,Math.max(0,Number(e.strength||0.5))),confidence:Math.min(1,Math.max(0,Number(e.confidence||0.5))),explanation:String(e.explanation||''),evidence:[],verifStatus:'INFERRED'});});
    allEnt.forEach(function(e,i){var s=extToId[e.parentNodeId];if(!s)return;allEdges.push({id:'eent'+i+'_'+ts,sourceNodeId:s,targetNodeId:e.id,relationshipType:'SERVES',direction:'directed',strength:e.confidence,confidence:e.confidence,explanation:e.name+' is a real entity in the '+e.category+' category',evidence:[],verifStatus:'INFERRED'});});

    // Stage 5: Discovery targets
    var targets;
    if(sameInput && draft.targets){
      targets=draft.targets;
      logGen('✅ (cached) '+targets.length+' discovery targets');
    } else {
      setStage('Stage 5/5: Ranking discovery targets…',88);logGen('🎯 Generating discovery targets…');
      var topN=allNodes.filter(function(n){return n.nodeType!=='STARTUP';}).sort(function(a,b){return b.discoveryPriority-a.discoveryPriority;}).slice(0,14);
      var topList2=topN.map(function(n){return n.externalId+': '+n.name+' ('+n.category+', L'+n.layer+', pri:'+n.discoveryPriority+')';}).join('\\n');
      var raw6=await callClaude(
        'Startup: '+summary+'\\nTop stakeholders:\\n'+topList2+'\\n\\nGenerate top 20 discovery targets ordered by priority.\\nReturn JSON array:\\n[{"nodeExternalId":"concept_ev_oem","name":"EV Two-Wheeler OEM","entityType":"Customer","category":"Direct Customer","layer":1,"discoveryPriority":94,"whyInterview":"Primary buyers — validate PMF, pricing, specs","hypothesisValidated":"BLDC motor quality is a pain point for OEMs","suggestedQuestions":["What motor specs do you source?","Who approves new suppliers?"],"evidenceMissing":"No confirmed demand signal","relatedStakeholders":["Procurement Head","Motor Engineer"]}]',
        'Customer discovery strategist.',3000);
      targets=parseJsonSafe(raw6);
      if(!Array.isArray(targets))targets=[];
      logGen('✅ '+targets.length+' discovery targets');
      draft.targets=targets;saveGenDraft(draft);
    }
    S.targets=targets.slice(0,20).map(function(t){return{nodeId:String(t.nodeExternalId||''),name:String(t.name||''),entityType:String(t.entityType||'Stakeholder'),category:String(t.category||''),layer:typeof t.layer==='number'?t.layer:1,discoveryPriority:Math.min(100,Math.max(0,Number(t.discoveryPriority||50))),whyInterview:String(t.whyInterview||''),hypothesisValidated:String(t.hypothesisValidated||''),suggestedQuestions:Array.isArray(t.suggestedQuestions)?t.suggestedQuestions:[],evidenceMissing:String(t.evidenceMissing||''),relatedStakeholders:Array.isArray(t.relatedStakeholders)?t.relatedStakeholders:[],verifStatus:'INFERRED'};});

    S.nodes=allNodes;S.edges=allEdges;
    S.versions=[{version:1,createdAt:new Date().toISOString(),changeLog:{added:allNodes.map(function(n){return{name:n.name};}),removed:[],changed:[]}}];
    // Track total pipeline usage (estimate from prompt sizes)
    var _totalIn=Math.round((INPUT.description||'').length/4 * 12); // ~12 prompts
    var _totalOut=Math.round(JSON.stringify(allNodes||[]).length/4);
    trackApiCall({feature:'ecosystem',stage:'generation',inputTokens:_totalIn,outputTokens:_totalOut,latencyMs:0,success:true});
    saveToHistory(null);
    clearGenDraft();
    setStage('✅ Ecosystem complete!',100);
    logGen('🌐 '+allNodes.length+' nodes · '+allEdges.length+' edges · '+S.targets.length+' targets');
    setTimeout(function(){initGraph();showView('view-graph');showMain('graph');},600);
  }catch(err){
    showView('view-input');
    showError('Generation failed: '+err.message+' — the stages that already completed are saved. Click Generate again to resume without re-paying for them.');
  }
}

// ═══════════════════════════════════════════════════════════
// GRAPH ENGINE
// ═══════════════════════════════════════════════════════════
function computePos(nodes){
  var pos={};var byLayer={};
  nodes.forEach(function(n){if(!byLayer[n.layer])byLayer[n.layer]=[];byLayer[n.layer].push(n);});
  Object.keys(byLayer).forEach(function(l){
    l=parseInt(l);var ns=byLayer[l];
    if(l===0){pos[ns[0].id]={x:CX,y:CY};return;}
    var r=getLR(l);var byCat={};
    ns.forEach(function(n){if(!byCat[n.category])byCat[n.category]=[];byCat[n.category].push(n);});
    var cats=Object.keys(byCat);
    cats.forEach(function(cat,ci){
      var catNodes=byCat[cat];var catStart=(2*Math.PI*ci)/cats.length;
      catNodes.forEach(function(n,ni){var a=catStart+ni*0.28-Math.PI/2;pos[n.id]={x:CX+r*Math.cos(a),y:CY+r*Math.sin(a)};});
    });
  });
  return pos;
}

var _basePos={},_visN=[],_visE=[],_tgtIds=new Set();

function getVisNodes(){
  return S.nodes.filter(function(n){
    if(S.graphMode==='concept'&&n.nodeType==='ENTITY')return false;
    if(S.graphMode==='entity'&&n.nodeType==='CONCEPT')return false;
    if(S.layerFilter&&n.layer!==parseInt(S.layerFilter)&&n.layer!==0)return false;
    if(S.hiddenCats.has(n.category))return false;
    if(S.collapsedLayers.has(n.layer)&&n.layer!==0)return false;
    if(S.verifFilter==='verified'&&n.verifStatus!=='VERIFIED')return false;
    if(S.verifFilter==='inferred'&&!['INFERRED','ASSUMED'].includes(n.verifStatus))return false;
    if(S.geoFilter&&n.geography&&!n.geography.toLowerCase().includes(S.geoFilter.toLowerCase()))return false;
    if(S.searchQ){var q=S.searchQ.toLowerCase();return n.name.toLowerCase().includes(q)||n.category.toLowerCase().includes(q);}
    return true;
  });
}

function posFor(id){return S.nodePos[id]||_basePos[id];}

function renderGraph(){
  _visN=getVisNodes();
  var visIds=new Set(_visN.map(function(n){return n.id;}));
  _visE=S.edges.filter(function(e){return visIds.has(e.sourceNodeId)&&visIds.has(e.targetNodeId);});
  _basePos=computePos(_visN);
  _tgtIds=new Set(S.targets.map(function(t){return t.nodeId;}));
  var g=el('graph-g');g.innerHTML='';
  g.setAttribute('transform','translate('+S.pan.x+','+S.pan.y+') scale('+S.zoom+')');

  // Rings
  var ls=[...new Set(_visN.map(function(n){return n.layer;}))].filter(function(l){return l>0;}).sort(function(a,b){return a-b;});
  ls.forEach(function(l){
    var c=mkEl('circle');c.setAttribute('cx',CX);c.setAttribute('cy',CY);c.setAttribute('r',getLR(l));
    c.setAttribute('fill','none');c.setAttribute('stroke','#DDE1E7');c.setAttribute('stroke-width','1.5');c.setAttribute('stroke-dasharray','4,8');c.setAttribute('opacity','0.7');g.appendChild(c);
    var t=mkEl('text');t.setAttribute('x',CX+getLR(l)-4);t.setAttribute('y',CY-5);t.setAttribute('text-anchor','end');t.setAttribute('font-size','9');t.setAttribute('fill','#B0B7C3');t.setAttribute('font-family','monospace');
    t.textContent='L'+l+' '+(S.layers[l]?S.layers[l].name.slice(0,13):'');g.appendChild(t);
  });

  // Edges
  _visE.forEach(function(e){
    var src=posFor(e.sourceNodeId),dst=posFor(e.targetNodeId);if(!src||!dst)return;
    var grp=mkEl('g');grp.dataset.eid=e.id;
    var line=mkEl('line');
    line.setAttribute('x1',src.x);line.setAttribute('y1',src.y);line.setAttribute('x2',dst.x);line.setAttribute('y2',dst.y);
    line.setAttribute('stroke','#9CA3AF');line.setAttribute('stroke-width','1.5');
    line.setAttribute('stroke-dasharray',VD[e.verifStatus]||'6,4');line.setAttribute('opacity','0.28');
    if(e.direction==='directed')line.setAttribute('marker-end','url(#arr-gray)');
    line.style.cursor='pointer';
    line.addEventListener('mouseenter',function(){S.hovEdge=e.id;updateHL();});
    line.addEventListener('mouseleave',function(){S.hovEdge=null;updateHL();});
    grp.appendChild(line);
    if(S.showEdgeLabels){
      var mx=(src.x+dst.x)/2,my=(src.y+dst.y)/2;
      var lt=mkEl('text');lt.setAttribute('x',mx);lt.setAttribute('y',my-4);lt.setAttribute('text-anchor','middle');lt.setAttribute('font-size','8');lt.setAttribute('fill','#9CA3AF');lt.setAttribute('font-family','monospace');lt.setAttribute('pointer-events','none');lt.setAttribute('opacity','0.6');
      lt.textContent=e.relationshipType.replace(/_/g,' ');grp.appendChild(lt);
    }
    g.appendChild(grp);
  });

  // Nodes
  _visN.forEach(function(n){
    var pos=posFor(n.id);if(!pos)return;
    var col=NC[n.nodeType]||'#6B7280';
    var r=n.nodeType==='STARTUP'?22:n.nodeType==='CONCEPT'?14:11;
    var isPri=_tgtIds.has(n.externalId)&&n.nodeType!=='STARTUP';
    var grp=mkEl('g');grp.setAttribute('transform','translate('+pos.x+','+pos.y+')');grp.dataset.nid=n.id;grp.classList.add('ng');grp.style.cursor='pointer';

    if(isPri){var pr=mkEl('circle');pr.setAttribute('r',r+5);pr.setAttribute('fill','none');pr.setAttribute('stroke','#C94F1C');pr.setAttribute('stroke-width','1.5');pr.setAttribute('stroke-dasharray','3,3');pr.setAttribute('opacity','0.9');grp.appendChild(pr);}
    if(n.nodeType==='ENTITY'&&n.verifStatus!=='VERIFIED'){var er=mkEl('circle');er.setAttribute('r',r+2.5);er.setAttribute('fill','none');er.setAttribute('stroke',col);er.setAttribute('stroke-width','1');er.setAttribute('stroke-dasharray','3,3');er.setAttribute('opacity','0.4');grp.appendChild(er);}

    var circ=mkEl('circle');circ.setAttribute('r',r);circ.setAttribute('fill',col);circ.setAttribute('stroke','transparent');circ.setAttribute('stroke-width','2.5');grp.appendChild(circ);

    var icon=mkEl('text');icon.setAttribute('text-anchor','middle');icon.setAttribute('dominant-baseline','central');icon.setAttribute('font-size',n.nodeType==='STARTUP'?'10':'7');icon.setAttribute('fill','rgba(255,255,255,0.75)');icon.setAttribute('font-family','monospace');icon.setAttribute('font-weight','700');icon.setAttribute('pointer-events','none');icon.textContent=n.nodeType==='STARTUP'?'⚡':(VI[n.verifStatus]||'○');grp.appendChild(icon);

    var lbl=mkEl('text');lbl.setAttribute('y',r+12);lbl.setAttribute('text-anchor','middle');lbl.setAttribute('font-size',n.nodeType==='STARTUP'?'11':'9');lbl.setAttribute('font-weight',n.nodeType==='STARTUP'?'800':'600');lbl.setAttribute('fill','#374151');lbl.setAttribute('font-family','Inter, sans-serif');lbl.setAttribute('pointer-events','none');lbl.textContent=n.name.length>20?n.name.slice(0,20)+'…':n.name;grp.appendChild(lbl);

    grp.addEventListener('click',function(ev){ev.stopPropagation();if(!S.draggingNode)openPanel(n.id);});
    grp.addEventListener('mouseenter',function(){S.hovNode=n.id;updateHL();});
    grp.addEventListener('mouseleave',function(){S.hovNode=null;updateHL();});
    grp.addEventListener('mousedown',function(ev){ev.stopPropagation();S.draggingNode=n.id;el('graph-svg').classList.add('dragging');});
    g.appendChild(grp);
  });

  el('graph-stats-badge').textContent=_visN.length+' nodes · '+_visE.length+' edges';
  updateStats();
}

function mkEl(tag){return document.createElementNS('http://www.w3.org/2000/svg',tag);}

function updateHL(){
  var g=el('graph-g');var hn=S.hovNode,he=S.hovEdge;
  g.querySelectorAll('.ng').forEach(function(grp){
    var nid=grp.dataset.nid;var dim=(hn||he)&&nid!==hn;
    grp.setAttribute('opacity',dim?'0.15':'1');
    var c=grp.querySelector('circle');if(c)c.setAttribute('stroke',nid===S.selNodeId?'white':nid===hn?'white':'transparent');
  });
  g.querySelectorAll('g[data-eid]').forEach(function(grp){
    var eid=grp.dataset.eid;var edge=S.edges.find(function(e){return e.id===eid;});
    var act=eid===he||(edge&&(edge.sourceNodeId===hn||edge.targetNodeId===hn));
    var line=grp.querySelector('line');
    if(line){line.setAttribute('stroke',act?'#C94F1C':'#9CA3AF');line.setAttribute('stroke-width',act?'2':'1.5');line.setAttribute('opacity',act?'1':(hn||he)?'0.05':'0.28');if(edge&&edge.direction==='directed')line.setAttribute('marker-end','url(#arr-'+(act?'orange':'gray')+')');}
  });
}

function updTransform(){el('graph-g').setAttribute('transform','translate('+S.pan.x+','+S.pan.y+') scale('+S.zoom+')');}
function zoomIn(){S.zoom=Math.min(2.5,S.zoom+0.12);updTransform();}
function zoomOut(){S.zoom=Math.max(0.25,S.zoom-0.12);updTransform();}
function fitView(){S.pan={x:0,y:0};S.zoom=0.72;updTransform();}
function toggleEdgeLabels(){S.showEdgeLabels=!S.showEdgeLabels;el('el-btn').classList.toggle('active',S.showEdgeLabels);renderGraph();}

function initSVGEvents(){
  var svg=el('graph-svg');
  svg.addEventListener('mousedown',function(e){if(e.target.closest('.ng'))return;S.isPanning=true;S.panStart={x:e.clientX-S.pan.x,y:e.clientY-S.pan.y};svg.classList.add('panning');});
  svg.addEventListener('mousemove',function(e){
    if(S.draggingNode){
      var rect=svg.getBoundingClientRect();var sx=(e.clientX-rect.left-S.pan.x)/S.zoom,sy=(e.clientY-rect.top-S.pan.y)/S.zoom;
      S.nodePos[S.draggingNode]={x:sx,y:sy};
      var grp=el('graph-g').querySelector('[data-nid="'+S.draggingNode+'"]');
      if(grp)grp.setAttribute('transform','translate('+sx+','+sy+')');
      el('graph-g').querySelectorAll('g[data-eid]').forEach(function(eg){
        var eid=eg.dataset.eid;var edge=S.edges.find(function(e2){return e2.id===eid;});if(!edge)return;
        if(edge.sourceNodeId!==S.draggingNode&&edge.targetNodeId!==S.draggingNode)return;
        var src=posFor(edge.sourceNodeId),dst=posFor(edge.targetNodeId);if(!src||!dst)return;
        var line=eg.querySelector('line');if(line){line.setAttribute('x1',src.x);line.setAttribute('y1',src.y);line.setAttribute('x2',dst.x);line.setAttribute('y2',dst.y);}
      });return;
    }
    if(!S.isPanning)return;S.pan={x:e.clientX-S.panStart.x,y:e.clientY-S.panStart.y};updTransform();
  });
  svg.addEventListener('mouseup',function(){S.isPanning=false;S.draggingNode=null;svg.classList.remove('panning','dragging');});
  svg.addEventListener('mouseleave',function(){S.isPanning=false;S.draggingNode=null;svg.classList.remove('panning','dragging');});
  svg.addEventListener('wheel',function(e){e.preventDefault();S.zoom=Math.min(2.5,Math.max(0.25,S.zoom-e.deltaY*0.0008));updTransform();},{passive:false});
}

// ═══════════════════════════════════════════════════════════
// TOOLBAR
// ═══════════════════════════════════════════════════════════
function showMain(v){
  var ub=el('sidebar-usage-btn');if(ub)ub.classList.remove('active-usage');
  ['graph','discovery','versions'].forEach(function(x){var t=el('tab-'+x);if(t)t.classList.remove('active');});
  var t=el('tab-'+v);if(t)t.classList.add('active');
  if(v==='graph'){showView('view-graph');renderGraph();}
  else if(v==='discovery'){showView('view-discovery');renderDiscovery();}
  else if(v==='versions'){showView('view-versions');renderVersions();}
}
function setMode(m){
  S.graphMode=m;['all','concept','entity'].forEach(function(x){el('gm-'+x).classList.toggle('active',x===m);});renderGraph();
}
function applyFilters(){S.verifFilter=el('verif-filter').value;S.layerFilter=el('layer-filter').value;S.geoFilter=el('geo-filter').value;S.searchQ=el('search-input').value;renderGraph();}
function showAllCats(){S.hiddenCats=new Set();buildCatBar();renderGraph();}
function expandAll(){S.collapsedLayers=new Set();buildLayerBar();renderGraph();}
function toggleCat(cat){S.hiddenCats.has(cat)?S.hiddenCats.delete(cat):S.hiddenCats.add(cat);buildCatBar();renderGraph();}
function toggleLayer(l){l=parseInt(l);S.collapsedLayers.has(l)?S.collapsedLayers.delete(l):S.collapsedLayers.add(l);buildLayerBar();renderGraph();}
function exportGraph(){
  var data=JSON.stringify({nodes:S.nodes,edges:S.edges,layers:S.layers,targets:S.targets},null,2);
  var blob=new Blob([data],{type:'application/json'});var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='ecosystem-'+Date.now()+'.json';a.click();URL.revokeObjectURL(url);showToast('Graph exported');
}
function resetToInput(){startNew();}

function updateStats(){
  el('stat-c').textContent='🔵 '+S.nodes.filter(function(n){return n.nodeType==='CONCEPT';}).length;
  el('stat-e').textContent='🟢 '+S.nodes.filter(function(n){return n.nodeType==='ENTITY';}).length;
  el('stat-t').textContent='🎯 '+S.targets.length;
  el('target-count').textContent=S.targets.length;
}
function buildCatBar(){
  var cats=[...new Set(S.nodes.map(function(n){return n.category;}))].sort();
  var div=el('cat-chips');div.innerHTML='';
  cats.forEach(function(cat){var btn=document.createElement('button');btn.className='cat-chip'+(S.hiddenCats.has(cat)?' hidden':'');btn.textContent=cat.slice(0,20);btn.onclick=function(){toggleCat(cat);};div.appendChild(btn);});
}
function buildLayerBar(){
  var ls=[...new Set(S.nodes.map(function(n){return n.layer;}))].filter(function(l){return l>0;}).sort(function(a,b){return a-b;});
  var lf=el('layer-filter');lf.innerHTML='<option value="">All layers</option>';
  ls.forEach(function(l){var o=document.createElement('option');o.value=l;o.textContent='L'+l+': '+(S.layers[l]?S.layers[l].name.slice(0,12):'');lf.appendChild(o);});
  var div=el('layer-chips');div.innerHTML='';
  ls.forEach(function(l){var btn=document.createElement('button');btn.className='layer-chip'+(S.collapsedLayers.has(l)?' collapsed':'');btn.textContent=(S.collapsedLayers.has(l)?'▶':'▼')+' L'+l+' '+(S.layers[l]?S.layers[l].name.slice(0,11):'');btn.onclick=function(){toggleLayer(l);};div.appendChild(btn);});
}
function initGraph(){buildCatBar();buildLayerBar();updateStats();if(!el('graph-svg')._evInit){initSVGEvents();el('graph-svg')._evInit=true;}setTimeout(renderGraph,50);}

// ═══════════════════════════════════════════════════════════
// NODE DETAIL PANEL
// ═══════════════════════════════════════════════════════════
function openPanel(nid){S.selNodeId=nid;S.dpTab='info';S.delConfirm=false;S.researchResult=null;renderPanel();el('detail-panel').classList.remove('hidden');updateHL();}
function closePanel(){S.selNodeId=null;el('detail-panel').classList.add('hidden');S.hovNode=null;updateHL();}
function getN(){return S.nodes.find(function(n){return n.id===S.selNodeId;});}

function renderPanel(){
  var n=getN();if(!n)return;
  var verif=VINFO[n.verifStatus]||VINFO.UNKNOWN;
  var sc=STATI[n.discoveryStatus]||STATI.NOT_RESEARCHED;
  el('dp-meta').textContent='L'+n.layer+' · '+n.category;
  el('dp-name').innerHTML='<span>'+n.name+'</span><button class="edit-trigger" onclick="startEditName()" title="Edit">✏️</button>';
  el('dp-badges').innerHTML='<span class="badge" style="background:'+verif.bg+';color:'+verif.color+'">'+verif.icon+' '+verif.label+'</span>'+'<span class="badge" style="background:'+sc.bg+';color:'+sc.c+'">'+sc.l+'</span>'+(n.nodeType==='ENTITY'?'<span class="badge" style="background:#EDE9FE;color:#6D28D9">'+(n.entityType||'Entity')+'</span>':'');
  function setSc(id,val,col){el('sc-'+id).style.width=val+'%';el('sv-'+id).textContent=val;}
  setSc('p',n.discoveryPriority);setSc('r',n.relevanceScore);setSc('i',n.importanceScore);setSc('c',Math.round(n.confidence*100));
  el('dp-status').value=n.discoveryStatus;
  document.querySelectorAll('.dp-tab').forEach(function(t,i){t.classList.toggle('active',['info','questions','evidence','connections','research','integrate'][i]===S.dpTab);});
  renderDpTab(n);
}
function dpTab(tab){S.dpTab=tab;renderPanel();}
function renderDpTab(n){
  var b=el('dp-body');b.innerHTML='';
  if(S.dpTab==='info')dpInfo(n,b);
  else if(S.dpTab==='questions')dpQ(n,b);
  else if(S.dpTab==='evidence')dpEv(n,b);
  else if(S.dpTab==='connections')dpConn(n,b);
  else if(S.dpTab==='research')dpResearch(n,b);
  else if(S.dpTab==='integrate')dpIntegrate(n,b);
}
function dpInfo(n,b){
  var tgt=S.targets.find(function(t){return t.nodeId===n.externalId;});
  b.innerHTML='<div class="dp-section"><div class="dp-section-title">Description <button class="edit-trigger" onclick="startEditDesc()">✏️</button></div><div id="dp-desc-view" style="font-size:13px;color:var(--ink);line-height:1.7">'+(n.description||'<em style="color:var(--mid)">No description</em>')+'</div></div>'
    +(n.whyItMatters?'<div class="dp-section"><div class="dp-section-title">Why It Matters</div><div class="why-box">'+n.whyItMatters+'</div></div>':'')
    +(n.nodeType==='ENTITY'&&(n.website||n.geography)?'<div class="dp-section"><div class="dp-section-title">Entity Details</div><div class="entity-box">'+(n.geography?'<div>📍 '+n.geography+'</div>':'')+(n.website?'<div><a href="'+n.website+'" target="_blank" style="color:var(--teal)">🌐 '+n.website.replace(/^https?:\\/\\//,'')+'</a></div>':'')+'</div></div>':'')
    +(tgt?'<div class="dp-section"><div class="dp-section-title">🎯 Discovery Target</div><div class="target-box"><div style="margin-bottom:4px"><strong>Why:</strong> '+tgt.whyInterview+'</div><div><strong>Validates:</strong> '+tgt.hypothesisValidated+'</div></div></div>':'')
    +'<div class="dp-section"><div class="dp-section-title">Notes</div><textarea class="notes-ta" id="dp-notes" rows="3" placeholder="Add private notes…">'+(n.metadata&&n.metadata.notes||'')+'</textarea><button class="notes-save-btn" onclick="saveNotes()">Save Notes</button></div>'
    +(n.tags&&n.tags.length?'<div class="dp-section"><div class="dp-section-title">Tags</div><div style="display:flex;flex-wrap:wrap;gap:4px">'+n.tags.map(function(t){return'<span class="also-chip">'+t+'</span>';}).join('')+'</div></div>':'');
}
function dpQ(n,b){
  var tgt=S.targets.find(function(t){return t.nodeId===n.externalId;});
  var qs=n.suggestedQuestions||[];
  b.innerHTML='<div class="dp-section"><div class="dp-section-title">Interview Questions ('+qs.length+')</div>'
    +(qs.length?qs.map(function(q,i){return'<div class="q-item"><span class="q-num">'+(i+1)+'.</span><span>'+q+'</span></div>';}).join(''):'<div style="color:var(--mid);font-size:13px;text-align:center;padding:18px 0">No questions generated.</div>')
    +'</div>'
    +(tgt&&tgt.evidenceMissing?'<div class="ev-missing">⚠️ <strong>Gap:</strong> '+tgt.evidenceMissing+'</div>':'')
    +(tgt&&tgt.relatedStakeholders&&tgt.relatedStakeholders.length?'<div class="dp-section"><div class="dp-section-title">Also Interview</div><div style="display:flex;flex-wrap:wrap;gap:4px">'+tgt.relatedStakeholders.map(function(s){return'<span class="also-chip">'+s+'</span>';}).join('')+'</div></div>':'');
}
function dpEv(n,b){
  var evs=n.evidence||[];
  b.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div class="dp-section-title" style="margin:0">Evidence ('+evs.length+')</div><button class="save-btn" onclick="showEvForm()" style="font-size:11px;padding:3px 9px">+ Add</button></div>'
    +'<div id="ev-form" style="display:none" class="add-ev-area"><textarea id="ev-text" rows="2" class="notes-ta" placeholder="Describe evidence…"></textarea><input id="ev-url" style="width:100%;padding:6px 9px;border:1px solid var(--border);border-radius:5px;font-size:11px;margin:5px 0;font-family:inherit" placeholder="Source URL (optional)"/><div style="display:flex;gap:5px"><button class="save-btn" onclick="saveEv()">Save</button><button class="cancel-btn" onclick="el(\\'ev-form\\').style.display=\\'none\\'">Cancel</button></div></div>'
    +(evs.length?evs.map(function(ev){return'<div class="ev-item"><div class="ev-meta"><span>'+(ev.type||'').replace(/_/g,' ')+'</span><span style="color:#7C3AED">'+Math.round((ev.confidence||0)*100)+'%</span></div><div>'+ev.content+'</div>'+(ev.sourceUrl?'<a href="'+ev.sourceUrl+'" target="_blank" style="font-size:11px;color:var(--teal)">🔗 Source</a>':'')+'</div>';}).join(''):'<div style="color:var(--mid);font-size:13px;text-align:center;padding:18px 0">No evidence yet.</div>');
}
function dpConn(n,b){
  var conns=S.edges.filter(function(e){return e.sourceNodeId===n.id||e.targetNodeId===n.id;}).map(function(e){var oid=e.sourceNodeId===n.id?e.targetNodeId:e.sourceNodeId;return{edge:e,node:S.nodes.find(function(x){return x.id===oid;}),out:e.sourceNodeId===n.id};}).filter(function(c){return c.node;});
  b.innerHTML='<div class="dp-section-title">Connections ('+conns.length+')</div>'
    +(conns.length?conns.map(function(c){return'<div class="conn-item"><div class="conn-header"><div class="conn-dot" style="background:'+(NC[c.node.nodeType]||'#6B7280')+'"></div><div class="conn-name">'+c.node.name+'</div><div class="conn-dir">'+(c.out?'→':'←')+'</div></div><select class="conn-select" data-eid="'+c.edge.id+'" onchange="changeRel(this)">'+RELS.map(function(r){return'<option value="'+r+'"'+(c.edge.relationshipType===r?' selected':'')+'>'+r.replace(/_/g,' ')+'</option>';}).join('')+'</select>'+(c.edge.explanation?'<div style="font-size:11px;color:var(--mid);margin-top:4px">'+c.edge.explanation+'</div>':'')+'</div>';}).join(''):'<div style="color:var(--mid);font-size:13px;text-align:center;padding:18px 0">No connections.</div>');
}
function dpResearch(n,b){
  b.innerHTML='<p style="font-size:13px;color:var(--mid);line-height:1.6;margin-bottom:10px">AI research brief. All claims labeled [INFERRED] or [UNKNOWN].</p>'
    +'<button onclick="runResearch()" style="width:100%;padding:9px;background:'+(S.researching?'var(--border)':'var(--navy)')+';color:'+(S.researching?'var(--mid)':'white')+';border:none;border-radius:6px;font-weight:700;font-size:13px;cursor:'+(S.researching?'not-allowed':'pointer')+';font-family:inherit;margin-bottom:10px">'+(S.researching?'🔬 Researching…':'🔬 Research this Entity')+'</button>'
    +(S.researchResult?'<div class="research-out">'+S.researchResult+'</div>':'');
}
function dpIntegrate(n,b){
  b.innerHTML='<div class="dp-section-title" style="margin-bottom:12px">Connect to Startup OS</div>'
    +'<p style="font-size:13px;color:var(--mid);line-height:1.6;margin-bottom:14px">Turn this ecosystem node into an actionable item in your startup workflow.</p>'
    +'<button class="integrate-btn" onclick="showToast(\\'Opening Discovery… (pre-filled with: '+n.name.replace(/'/g,"\\\\'")+'\\')"><div class="ib-title">🎤 Create Discovery Interview</div><div class="ib-desc">Add this stakeholder as an interview target</div></button>'
    +'<button class="integrate-btn" onclick="showToast(\\'Opening Hypotheses… (pre-filled with: '+n.name.replace(/'/g,"\\\\'")+'\\')"><div class="ib-title">🧪 Create Hypothesis</div><div class="ib-desc">Turn the relationship assumption into a testable hypothesis</div></button>'
    +'<button class="integrate-btn" onclick="showToast(\\'Opening Experiments… (pre-filled with: '+n.name.replace(/'/g,"\\\\'")+'\\')"><div class="ib-title">⚗️ Create Experiment</div><div class="ib-desc">Design an experiment to validate this relationship</div></button>';
}

// Panel actions
function startEditName(){var n=getN();if(!n)return;el('dp-name').innerHTML='<input class="inline-input" id="ne-inp" value="'+n.name.replace(/"/g,'&quot;')+'"/><div class="edit-actions"><button class="save-btn" onclick="saveEditName()">Save</button><button class="cancel-btn" onclick="renderPanel()">Cancel</button></div>';el('ne-inp').focus();el('ne-inp').addEventListener('keydown',function(e){if(e.key==='Enter')saveEditName();if(e.key==='Escape')renderPanel();});}
function saveEditName(){var n=getN();if(!n)return;var v=(el('ne-inp')&&el('ne-inp').value||'').trim();if(!v)return;n.name=v;showToast('Name updated');renderPanel();renderGraph();}
function startEditDesc(){var n=getN();if(!n)return;var d=el('dp-desc-view');d.innerHTML='<textarea class="inline-textarea" id="de-ta" rows="3">'+n.description+'</textarea><div class="edit-actions"><button class="save-btn" onclick="saveEditDesc()">Save</button><button class="cancel-btn" onclick="renderPanel()">Cancel</button></div>';el('de-ta').focus();}
function saveEditDesc(){var n=getN();if(!n)return;var v=(el('de-ta')&&el('de-ta').value||'');n.description=v;showToast('Description updated');renderPanel();}
function saveNotes(){var n=getN();if(!n)return;var v=el('dp-notes')&&el('dp-notes').value||'';if(!n.metadata)n.metadata={};n.metadata.notes=v;showToast('Notes saved ✅');}
function showEvForm(){var f=el('ev-form');if(f)f.style.display='block';}
function saveEv(){var n=getN();if(!n)return;var txt=(el('ev-text')&&el('ev-text').value||'').trim();var url=(el('ev-url')&&el('ev-url').value||'').trim();if(!txt)return;if(!n.evidence)n.evidence=[];n.evidence.push({id:'ev_'+Date.now(),type:'MANUAL',content:txt,sourceUrl:url||undefined,confidence:0.8,addedAt:new Date().toISOString()});showToast('Evidence saved');renderPanel();}
function changeRel(sel){var eid=sel.dataset.eid;var edge=S.edges.find(function(e){return e.id===eid;});if(edge){edge.relationshipType=sel.value;showToast('Relationship updated');renderGraph();}}
function updateStatus(status){var n=getN();if(!n)return;n.discoveryStatus=status;renderPanel();}
function confirmDel(){
  var n=getN();if(!n)return;
  if(!S.delConfirm){el('dp-delete-btn').textContent='⚠️ Confirm Delete?';el('dp-delete-btn').style.background='var(--red)';el('dp-delete-btn').style.color='white';S.delConfirm=true;setTimeout(function(){if(S.delConfirm){el('dp-delete-btn').textContent='🗑 Remove Node';el('dp-delete-btn').style.background='';el('dp-delete-btn').style.color='var(--red)';S.delConfirm=false;}},3000);return;}
  var id=S.selNodeId;S.nodes=S.nodes.filter(function(x){return x.id!==id;});S.edges=S.edges.filter(function(e){return e.sourceNodeId!==id&&e.targetNodeId!==id;});closePanel();renderGraph();buildCatBar();showToast('Node removed');
}

async function runResearch(){
  var n=getN();if(!n||S.researching)return;
  S.researching=true;S.researchResult=null;renderPanel();
  try{
    var prompt='Research target:\\n- Name: '+n.name+'\\n- Type: '+(n.entityType||n.nodeType)+'\\n- Category: '+n.category+'\\n- Description: '+n.description+'\\n\\nStartup context: '+INPUT.description+'\\nIndustry: '+INPUT.industry+'\\nGeography: '+INPUT.geography+'\\n\\nAnswer all 8 questions. Label EVERY factual claim [INFERRED] or [UNKNOWN]. Never invent facts.\\n1. What does this organization do?\\n2. Which market do they serve?\\n3. Why could they be relevant to this startup?\\n4. Likely technology or operational setup?\\n5. Any publicly known partnerships or relationships?\\n6. Evidence supporting a potential relationship with this startup?\\n7. What is still unknown?\\n8. Recommended first contact approach';
    // research returns prose not JSON, so it goes through callClaudeText not callClaude
    var _rsMs=Date.now();
    S.researchResult=await callClaudeText(prompt,'You are a startup ecosystem research analyst. Label all uncertainty as [INFERRED] or [UNKNOWN]. Never invent facts.',1400);
    n.discoveryStatus='RESEARCHING';
    trackApiCall({feature:'research',stage:n.name.slice(0,30),inputTokens:Math.round(prompt.length/4),outputTokens:Math.round((S.researchResult||'').length/4),latencyMs:Date.now()-_rsMs,success:true});
  }catch(err){
    S.researchResult='Research failed: '+err.message+'.\\n\\nTip: Make sure your API key is correct and you have available credits.';
  }
  S.researching=false;renderPanel();
}

// callClaudeText — same as callClaude but returns plain text not JSON
async function callClaudeText(prompt,system,maxTokens){
  maxTokens=maxTokens||1400;
  var payload={system:system,prompt:prompt,maxTokens:maxTokens};
  var res;
  try{
    res=await fetch(API_BASE+'/api/ai/raw',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken()},
      body:JSON.stringify(payload)
    });
  }catch(netErr){
    throw new Error('Network error — cannot reach Founder OS backend. Check internet connection.');
  }
  var data;
  try{data=await res.json();}catch(e){throw new Error('Bad response from server (status '+res.status+')');}
  if(!res.ok){
    if(res.status===401)throw new Error('Your session expired — sign in again.');
    if(res.status===429)throw new Error('Rate limited (429) — wait a moment and try again');
    throw new Error('API error '+(data&&data.error||res.status));
  }
  return data.text||'No response generated.';
}

// ═══════════════════════════════════════════════════════════
// DISCOVERY VIEW
// ═══════════════════════════════════════════════════════════
function setDiscMode(m){S.discMode=m;el('dm-ranked').classList.toggle('active',m==='ranked');el('dm-bucketed').classList.toggle('active',m==='bucketed');renderDiscovery();}

function renderDiscovery(){
  var b=el('disc-body');
  var sorted=[...S.targets].sort(function(a,b){return b.discoveryPriority-a.discoveryPriority;});
  var high=S.targets.filter(function(t){return t.discoveryPriority>=80;}).length;
  var med=S.targets.filter(function(t){return t.discoveryPriority>=60&&t.discoveryPriority<80;}).length;
  var pc=function(p){return p>=80?'#EF4444':p>=60?'#F59E0B':'#10B981';};
  var pl=function(p){return p>=80?'HIGH':p>=60?'MEDIUM':'LOW';};
  var html='<div class="disc-stats"><div class="disc-stat"><div class="disc-stat-val" style="color:var(--navy)">'+S.targets.length+'</div><div class="disc-stat-lbl">Total</div></div><div class="disc-stat"><div class="disc-stat-val" style="color:#EF4444">'+high+'</div><div class="disc-stat-lbl">High</div></div><div class="disc-stat"><div class="disc-stat-val" style="color:#F59E0B">'+med+'</div><div class="disc-stat-lbl">Medium</div></div><div class="disc-stat"><div class="disc-stat-val" style="color:#10B981">'+(S.targets.length-high-med)+'</div><div class="disc-stat-lbl">Low</div></div></div>';
  if(S.discMode==='ranked'){
    html+=sorted.map(function(t,i){return'<div class="target-card"><div class="target-card-header" onclick="togTarget(\\''+t.nodeId+'\\')"><div class="target-rank" style="background:'+pc(t.discoveryPriority)+'">'+(i+1)+'</div><div style="flex:1;min-width:0"><div class="target-name">'+t.name+'</div><div class="target-cat">'+t.category+' · L'+t.layer+'</div></div><div style="text-align:right;flex-shrink:0"><div class="target-score" style="color:'+pc(t.discoveryPriority)+'">'+t.discoveryPriority+'</div><div class="target-score-lbl" style="color:'+pc(t.discoveryPriority)+'">'+pl(t.discoveryPriority)+'</div></div><div style="color:var(--mid);font-size:11px;margin-left:5px">▼</div></div>'
      +'<div class="target-body" id="tb-'+t.nodeId+'" style="display:none"><div class="target-section"><div class="target-section-title">Why Interview</div><div style="font-size:13px;color:var(--ink);line-height:1.6">'+t.whyInterview+'</div></div>'
      +'<div class="target-section"><div class="target-section-title">Validates</div><div style="font-size:13px;color:var(--ink);line-height:1.6">'+t.hypothesisValidated+'</div></div>'
      +(t.suggestedQuestions&&t.suggestedQuestions.length?'<div class="target-section"><div class="target-section-title">Suggested Questions</div>'+t.suggestedQuestions.map(function(q,qi){return'<div class="q-item"><span class="q-num">'+(qi+1)+'.</span><span>'+q+'</span></div>';}).join('')+'</div>':'')
      +(t.evidenceMissing?'<div class="ev-missing">⚠️ <strong>Gap:</strong> '+t.evidenceMissing+'</div>':'')
      +(t.relatedStakeholders&&t.relatedStakeholders.length?'<div class="target-section"><div class="target-section-title">Also Interview</div><div style="display:flex;flex-wrap:wrap;gap:4px">'+t.relatedStakeholders.map(function(s){return'<span class="also-chip">'+s+'</span>';}).join('')+'</div></div>':'')
      +'<button class="target-goto" onclick="gotoNode(\\''+t.nodeId+'\\')">View in Graph →</button></div></div>';}).join('');
  }else{
    var buckets={'Potential Customers':[],'Engineering':[],'Procurement':[],'Suppliers':[],'Distributors':[],'System Integrators':[],'Industry Experts':[],'Competitors':[]};
    sorted.forEach(function(t){var c=t.category.toLowerCase();if(c.includes('customer')||c.includes('buyer')||c.includes('oem'))buckets['Potential Customers'].push(t);else if(c.includes('engineer')||c.includes('technical')||c.includes('r&d'))buckets['Engineering'].push(t);else if(c.includes('procure')||c.includes('sourcing'))buckets['Procurement'].push(t);else if(c.includes('supplier')||c.includes('vendor'))buckets['Suppliers'].push(t);else if(c.includes('distribut')||c.includes('channel'))buckets['Distributors'].push(t);else if(c.includes('integrat')||c.includes('partner'))buckets['System Integrators'].push(t);else if(c.includes('compet')||c.includes('alternative'))buckets['Competitors'].push(t);else buckets['Industry Experts'].push(t);});
    html+='<div class="bucket-hero"><h3>Your First 20 Conversations</h3><p>Balanced mix across customer types, technical experts, procurement, suppliers, and competitive intelligence.</p></div>';
    Object.entries(buckets).forEach(function(entry){var bname=entry[0],items=entry[1];if(!items.length)return;html+='<div class="bucket-section"><div class="bucket-title">'+bname+'<span>('+items.length+')</span></div>'+items.slice(0,3).map(function(t,i){return'<div class="bucket-item" onclick="gotoNode(\\''+t.nodeId+'\\')"><div class="bucket-rank" style="background:'+pc(t.discoveryPriority)+'">'+(i+1)+'</div><div style="flex:1;min-width:0"><div class="bucket-name">'+t.name+'</div><div class="bucket-meta">'+t.entityType+' · '+t.discoveryPriority+'</div></div><span style="font-size:11px;color:var(--mid)">→</span></div>';}).join('')+(items.length>3?'<div style="font-size:11px;color:var(--mid);text-align:center;padding:3px 0">+'+( items.length-3)+' more</div>':'')+'</div>';});
  }
  b.innerHTML=html;
}
function togTarget(nid){var tb=el('tb-'+nid);if(tb)tb.style.display=tb.style.display==='none'?'block':'none';}
function gotoNode(extId){var node=S.nodes.find(function(n){return n.externalId===extId;});if(!node){showToast('Node not found');return;}showMain('graph');setTimeout(function(){openPanel(node.id);},100);}

// ═══════════════════════════════════════════════════════════
// VERSIONS
// ═══════════════════════════════════════════════════════════
function renderVersions(){
  var list=el('versions-list');
  if(!S.versions.length){list.innerHTML='<div style="color:var(--mid)">No version history yet.</div>';return;}
  list.innerHTML=S.versions.map(function(v){var log=v.changeLog||{};return'<div class="version-card"><div class="version-header"><div class="version-tag">Version '+v.version+'</div><div class="version-date">'+new Date(v.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+'</div></div><div>'+(log.added&&log.added.length?'<div style="font-size:12px;color:#065F46">+ '+log.added.length+' nodes added</div>':'')+(log.removed&&log.removed.length?'<div style="font-size:12px;color:#991B1B">− '+log.removed.length+' removed</div>':'')+'<div style="font-size:12px;color:var(--mid)">'+new Date(v.createdAt).toLocaleTimeString()+'</div></div></div>';}).join('');
}

// ═══════════════════════════════════════════════════════════
// ADD NODE MODAL
// ═══════════════════════════════════════════════════════════
function showAddNode(){
  S.addType='CONCEPT';
  var ls=[...new Set(S.nodes.map(function(n){return n.layer;}))].filter(function(l){return l>0;}).sort(function(a,b){return a-b;});
  var sel=el('an-layer');sel.innerHTML=ls.map(function(l){return'<option value="'+l+'">Layer '+l+': '+(S.layers[l]?S.layers[l].name:'')+'</option>';}).join('');
  el('an-name').value='';el('an-cat').value='';el('an-desc').value='';if(el('an-geo2'))el('an-geo2').value='';if(el('an-web'))el('an-web').value='';
  el('an-entity-fields').style.display='none';el('nt-concept').classList.add('active');el('nt-entity').classList.remove('active');
  el('add-node-modal').classList.remove('hidden');
}
function setAddType(t){S.addType=t;el('nt-concept').classList.toggle('active',t==='CONCEPT');el('nt-entity').classList.toggle('active',t==='ENTITY');el('an-entity-fields').style.display=t==='ENTITY'?'block':'none';}
function saveNode(){
  var name=(el('an-name').value||'').trim(),cat=(el('an-cat').value||'').trim();
  if(!name||!cat){showToast('Name and category required');return;}
  var layer=parseInt(el('an-layer').value||'1');
  var node=scoreNode({id:'manual_'+Date.now(),externalId:'manual_'+Date.now(),nodeType:S.addType,category:cat,name,description:(el('an-desc').value||'').trim(),layer,importanceScore:50,relevanceScore:50,discoveryPriority:0,confidence:0.5,tags:[],evidence:[],metadata:{},discoveryStatus:'NOT_RESEARCHED',whyItMatters:'',suggestedQuestions:[],verifStatus:'UNKNOWN',sourceUrls:[],entityType:S.addType==='ENTITY'?(el('an-etype')&&el('an-etype').value||'Company'):null,website:S.addType==='ENTITY'?(el('an-web')&&el('an-web').value||null):null,geography:S.addType==='ENTITY'?(el('an-geo2')&&el('an-geo2').value||null):null,parentNodeId:null});
  S.nodes.push(node);hideMod('add-node-modal');buildCatBar();renderGraph();showToast('Node added: '+name);
}

// ═══════════════════════════════════════════════════════════
// CONNECT MODAL
// ═══════════════════════════════════════════════════════════
function showConnect(){
  var opts=S.nodes.filter(function(n){return n.nodeType!=='STARTUP';}).map(function(n){return'<option value="'+n.id+'">'+n.name+' (L'+n.layer+')</option>';}).join('');
  el('cn-src').innerHTML='<option value="">Select…</option>'+opts;
  el('cn-dst').innerHTML='<option value="">Select…</option>'+opts;
  el('cn-exp').value='';el('cn-str').value=70;el('cn-sv').textContent='70%';
  el('conn-prev').classList.add('hidden');el('connect-modal').classList.remove('hidden');
}
function updConnPrev(){
  var sid=el('cn-src').value,did=el('cn-dst').value,rel=el('cn-rel').value;
  if(sid&&did){var s=S.nodes.find(function(n){return n.id===sid;}),d=S.nodes.find(function(n){return n.id===did;});if(s&&d){el('conn-prev').innerHTML='<strong>'+s.name+'</strong> <strong style="color:var(--orange)">—'+rel.replace(/_/g,' ')+'→</strong> <strong>'+d.name+'</strong>';el('conn-prev').classList.remove('hidden');}}else el('conn-prev').classList.add('hidden');
}
function saveEdge(){
  var sid=el('cn-src').value,did=el('cn-dst').value;
  if(!sid||!did||sid===did){showToast('Select two different nodes');return;}
  S.edges.push({id:'manual_edge_'+Date.now(),sourceNodeId:sid,targetNodeId:did,relationshipType:el('cn-rel').value,direction:'directed',strength:parseInt(el('cn-str').value)/100,confidence:0.5,explanation:(el('cn-exp').value||'').trim()||'Manually added',evidence:[],verifStatus:'ASSUMED'});
  hideMod('connect-modal');renderGraph();showToast('Edge added');
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════
// HISTORY SIDEBAR
// ═══════════════════════════════
var HK='lp_ecosystems';
var cHId=null;

function loadHist(){try{if(window.__ecoBridge)return window.__ecoBridge.load()||[];return JSON.parse(localStorage.getItem(HK)||'[]');}catch(e){return[];}}
function saveHist(l){try{if(window.__ecoBridge){window.__ecoBridge.save(l);return;}localStorage.setItem(HK,JSON.stringify(l));}catch(e){showToast('Storage full');}}

function saveToHistory(name){
  var l=loadHist(),now=new Date().toISOString();
  if(cHId){
    var i=l.findIndex(function(e){return e.id===cHId;});
    if(i>=0){
      l[i].nodes=S.nodes;l[i].edges=S.edges;l[i].layers=S.layers;l[i].targets=S.targets;l[i].versions=S.versions;
      l[i].inputProfile=INPUT;l[i].updatedAt=now;l[i].nodeCount=S.nodes.length;
      l[i].entityCount=S.nodes.filter(function(n){return n.nodeType==='ENTITY';}).length;
      l[i].targetCount=S.targets.length;
      if(name)l[i].name=name;
      saveHist(l);renderHist();return cHId;
    }
  }
  var nm=name||((INPUT.description||'Ecosystem').slice(0,42)+' — '+new Date().toLocaleDateString());
  var e={id:'eco_'+Date.now(),name:nm,createdAt:now,updatedAt:now,
    nodeCount:S.nodes.length,entityCount:S.nodes.filter(function(n){return n.nodeType==='ENTITY';}).length,
    targetCount:S.targets.length,inputProfile:INPUT,
    nodes:S.nodes,edges:S.edges,layers:S.layers,targets:S.targets,versions:S.versions};
  l.unshift(e);if(l.length>20)l=l.slice(0,20);
  saveHist(l);cHId=e.id;renderHist();return e.id;
}

function renderHist(){
  var l=loadHist(),c=el('hist-list');if(!c)return;c.innerHTML='';
  if(!l.length){
    var d=document.createElement('div');d.id='hist-empty';
    d.innerHTML='<div style="font-size:26px;margin-bottom:8px">&#127760;</div>No saved ecosystems yet.<br/>Generate your first map.';
    c.appendChild(d);return;
  }
  l.forEach(function(e){
    var isAc=e.id===cHId;
    var date=new Date(e.updatedAt||e.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var div=document.createElement('div');div.className='hi'+(isAc?' ac':'');
    div.onclick=function(){loadEco(e.id);};
    var n=document.createElement('div');n.className='hi-name';n.title=e.name||'';n.textContent=e.name||'Untitled';div.appendChild(n);
    var m=document.createElement('div');m.className='hi-meta';
    var ind=(e.inputProfile&&e.inputProfile.industry)||'';
    var geo=(e.inputProfile&&e.inputProfile.geography)||'';
    var r1=document.createElement('div');r1.textContent=ind.slice(0,16)+(ind&&geo?' · ':'')+geo.slice(0,12);
    var r2=document.createElement('div');r2.textContent=(e.nodeCount||0)+' nodes · '+(e.entityCount||0)+' entities · '+(e.targetCount||0)+' targets';
    var r3=document.createElement('div');r3.textContent=date;
    m.appendChild(r1);m.appendChild(r2);m.appendChild(r3);div.appendChild(m);
    var db=document.createElement('button');db.className='hi-del';db.title='Delete';db.textContent='×';
    db.onclick=function(ev){ev.stopPropagation();delFromHist(ev,e.id);};div.appendChild(db);
    c.appendChild(div);
  });
}

function loadEco(id){
  var l=loadHist(),e=l.find(function(x){return x.id===id;});
  if(!e){showToast('Not found');return;}
  S.nodes=e.nodes||[];S.edges=e.edges||[];S.layers=e.layers||[];
  S.targets=e.targets||[];S.versions=e.versions||[];
  S.nodePos={};S.pan={x:0,y:0};S.zoom=0.72;
  S.hiddenCats=new Set();S.collapsedLayers=new Set();S.selNodeId=null;
  INPUT=e.inputProfile||{};cHId=id;
  renderHist();initGraph();showView('view-graph');showMain('graph');closePanel();
  showToast('Loaded: '+(e.name||'').slice(0,38));
}

function delFromHist(event,id){
  event.stopPropagation();
  var l=loadHist(),e=l.find(function(x){return x.id===id;});if(!e)return;
  if(!confirm('Delete "'+( e.name||'').slice(0,50)+'"?\\nCannot be undone.'))return;
  var nl=l.filter(function(x){return x.id!==id;});saveHist(nl);
  if(cHId===id){cHId=null;if(nl.length){loadEco(nl[0].id);}else{startNew();}}
  else{renderHist();}
  showToast('Deleted');
}

function startNew(){
  cHId=null;S.nodes=[];S.edges=[];S.layers=[];S.targets=[];S.versions=[];
  S.nodePos={};S.pan={x:0,y:0};S.zoom=0.72;
  S.hiddenCats=new Set();S.collapsedLayers=new Set();S.selNodeId=null;INPUT={};
  closePanel();renderHist();showView('view-input');
}

function importEco(input){
  var file=input.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(ev){
    try{
      var d=JSON.parse(ev.target.result);
      if(!d.nodes||!d.edges){showError('Invalid file. Use ⬇ Export first.');return;}
      S.nodes=d.nodes||[];S.edges=d.edges||[];S.layers=d.layers||[];
      S.targets=d.targets||[];S.versions=d.versions||[];
      S.nodePos={};S.pan={x:0,y:0};S.zoom=0.72;
      S.hiddenCats=new Set();S.collapsedLayers=new Set();S.selNodeId=null;
      INPUT=d.inputProfile||{};cHId=null;
      saveToHistory(((INPUT.description||file.name.replace('.json','')).slice(0,46))+' (imported)');
      initGraph();showView('view-graph');showMain('graph');closePanel();
      showToast('Imported: '+S.nodes.length+' nodes');
    }catch(err){showError('Import failed: '+err.message);}
    input.value='';
  };
  reader.readAsText(file);
}

function renameEco(){
  if(!cHId){showToast('No active ecosystem');return;}
  var l=loadHist(),e=l.find(function(x){return x.id===cHId;});if(!e)return;
  var n=prompt('Rename:',e.name||'');if(!n||!n.trim())return;
  saveToHistory(n.trim());showToast('Renamed');
}


// ═══════════════════════════════════════════════════════════
// API USAGE TRACKING — stored in localStorage: lp_usage_log
// Each entry: { id, feature, stage, inputTokens, outputTokens,
//               costUsd, latencyMs, success, ts }
// Pricing: claude-sonnet-4-6 $3/1M input · $15/1M output
// ═══════════════════════════════════════════════════════════
var USAGE_KEY = 'lp_usage_log';
var usageRange = '30d';

var PRICING = { input: 3.00, output: 15.00 }; // per 1M tokens

function calcCost(inputT, outputT){
  return (inputT * PRICING.input + outputT * PRICING.output) / 1_000_000;
}

function loadUsage(){
  try{ return JSON.parse(localStorage.getItem(USAGE_KEY)||'[]'); }
  catch(e){ return []; }
}
function saveUsageLog(log){
  // Keep max 500 entries
  if(log.length > 500) log = log.slice(0,500);
  try{ localStorage.setItem(USAGE_KEY, JSON.stringify(log)); }
  catch(e){}
}

function trackApiCall(opts){
  // opts: { feature, stage, inputTokens, outputTokens, latencyMs, success }
  var log = loadUsage();
  var entry = {
    id:          'u_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    feature:     opts.feature    || 'ecosystem',
    stage:       opts.stage      || '',
    inputTokens: opts.inputTokens  || 0,
    outputTokens:opts.outputTokens || 0,
    totalTokens: (opts.inputTokens||0) + (opts.outputTokens||0),
    costUsd:     calcCost(opts.inputTokens||0, opts.outputTokens||0),
    latencyMs:   opts.latencyMs  || 0,
    success:     opts.success !== false,
    ts:          new Date().toISOString(),
  };
  log.unshift(entry);
  saveUsageLog(log);
}

function filterByRange(log, range){
  if(range === 'all') return log;
  var days = range === '7d' ? 7 : 30;
  var since = Date.now() - days * 86400_000;
  return log.filter(function(e){ return new Date(e.ts).getTime() >= since; });
}

function fmtK(n){ return n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n); }
function fmtCost(n){ return '$' + n.toFixed(4); }

var FEAT_ICONS = {
  ecosystem:'🌐', agent:'🤖', interview:'🎤', research:'🔬',
  'pitch-deck':'📊', bmc:'🗺', hypothesis:'🧪', experiment:'⚗️', general:'⚙️',
};

function showUsageView(){
  showView('view-usage');
  // Update sidebar button state
  var btn = el('sidebar-usage-btn');
  if(btn) btn.classList.add('active-usage');
  renderUsage();
}

function setUsageRange(r, btn){
  usageRange = r;
  document.querySelectorAll('.range-btn').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  renderUsage();
}

function renderUsage(){
  var allLog  = loadUsage();
  var log     = filterByRange(allLog, usageRange);
  var isEmpty = log.length === 0;

  // ── Summary ──
  var totalCost = log.reduce(function(s,e){ return s + (e.costUsd||0); }, 0);
  var totalIn   = log.reduce(function(s,e){ return s + (e.inputTokens||0); }, 0);
  var totalOut  = log.reduce(function(s,e){ return s + (e.outputTokens||0); }, 0);
  var totalTok  = totalIn + totalOut;
  var avgLat    = log.length ? Math.round(log.reduce(function(s,e){ return s + (e.latencyMs||0); }, 0) / log.length) : 0;

  el('u-total-cost').textContent   = fmtCost(totalCost);
  el('u-total-calls').textContent  = log.length + ' API calls';
  el('u-total-tokens').textContent = fmtK(totalTok);
  el('u-token-split').textContent  = fmtK(totalIn) + ' in · ' + fmtK(totalOut) + ' out';
  el('u-avg-latency').textContent  = avgLat + 'ms';
  el('u-latency-sub').textContent  = 'across ' + log.length + ' calls';

  // ── Daily chart ──
  var dayMap = {};
  log.forEach(function(e){
    var day = e.ts.slice(0,10);
    if(!dayMap[day]) dayMap[day] = { cost:0, tokens:0, calls:0 };
    dayMap[day].cost   += e.costUsd||0;
    dayMap[day].tokens += e.totalTokens||0;
    dayMap[day].calls  += 1;
  });
  var days = Object.keys(dayMap).sort();
  // Fill missing days
  if(days.length > 1){
    var cur = new Date(days[0]);
    var end = new Date(days[days.length-1]);
    while(cur <= end){
      var d = cur.toISOString().slice(0,10);
      if(!dayMap[d]) dayMap[d] = { cost:0, tokens:0, calls:0 };
      cur.setDate(cur.getDate()+1);
    }
    days = Object.keys(dayMap).sort();
  }
  var maxCost = Math.max.apply(null, days.map(function(d){ return dayMap[d].cost; })) || 0.001;

  var barsDiv = el('u-chart-bars'); barsDiv.innerHTML = '';
  days.slice(-30).forEach(function(d){
    var dd = dayMap[d];
    var pct = Math.max(2, Math.round((dd.cost / maxCost) * 100));
    var bar = document.createElement('div');
    bar.className = 'chart-bar' + (dd.cost === 0 ? ' empty' : '');
    bar.style.height = pct + 'px';
    bar.title = d + ': ' + fmtCost(dd.cost) + ' · ' + fmtK(dd.tokens) + ' tokens · ' + dd.calls + ' calls';
    barsDiv.appendChild(bar);
  });
  var xDiv = el('u-chart-x'); xDiv.innerHTML = '';
  if(days.length){
    xDiv.innerHTML = '<span>'+days[0]+'</span><span>'+days[days.length-1]+'</span>';
  }

  // ── By feature ──
  var featMap = {};
  log.forEach(function(e){
    var f = e.feature || 'general';
    if(!featMap[f]) featMap[f] = { calls:0, tokens:0, cost:0 };
    featMap[f].calls  += 1;
    featMap[f].tokens += e.totalTokens||0;
    featMap[f].cost   += e.costUsd||0;
  });
  var feats = Object.entries(featMap).sort(function(a,b){ return b[1].cost - a[1].cost; });
  var fl = el('u-feat-list'); fl.innerHTML = '';
  if(!feats.length){
    fl.innerHTML = '<div style="color:var(--mid);font-size:13px;text-align:center;padding:14px 0">No data for this period.</div>';
  } else {
    feats.forEach(function(entry){
      var f = entry[0], d = entry[1];
      var pct = totalCost > 0 ? (d.cost / totalCost * 100) : 0;
      var row = document.createElement('div'); row.className = 'feat-row';
      row.innerHTML =
        '<div class="feat-icon">'+(FEAT_ICONS[f]||'⚙️')+'</div>'+
        '<div class="feat-info">'+
          '<div class="feat-name">'+f+'</div>'+
          '<div class="feat-bar-wrap"><div class="feat-bar-fill" style="width:'+pct.toFixed(1)+'%"></div></div>'+
          '<div class="feat-meta"><span>'+d.calls+' calls · '+fmtK(d.tokens)+' tokens</span><span>'+pct.toFixed(1)+'%</span></div>'+
        '</div>'+
        '<div class="feat-cost">'+fmtCost(d.cost)+'</div>';
      fl.appendChild(row);
    });
  }

  // ── Recent table ──
  var tbody = el('u-recent-body'); tbody.innerHTML = '';
  if(isEmpty){
    el('u-empty').style.display = 'block';
    el('u-chart-card').style.display = 'none';
    el('u-feat-card').style.display  = 'none';
  } else {
    el('u-empty').style.display = 'none';
    el('u-chart-card').style.display = '';
    el('u-feat-card').style.display  = '';
    log.slice(0,50).forEach(function(e){
      var tr = document.createElement('tr');
      var time = new Date(e.ts).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      tr.innerHTML =
        '<td style="color:var(--ink)">'+(FEAT_ICONS[e.feature]||'⚙️')+' <span style="text-transform:capitalize">'+(e.feature||'general')+'</span></td>'+
        '<td style="color:var(--mid);font-size:11px">'+(e.stage||'—')+'</td>'+
        '<td style="font-family:monospace">'+fmtK(e.inputTokens||0)+'</td>'+
        '<td style="font-family:monospace">'+fmtK(e.outputTokens||0)+'</td>'+
        '<td style="color:var(--orange);font-weight:700;font-family:monospace">'+fmtCost(e.costUsd||0)+'</td>'+
        '<td style="color:var(--mid);font-family:monospace">'+(e.latencyMs||0)+'ms</td>'+
        '<td><span class="'+(e.success?'status-ok':'status-err')+'">'+(e.success?'OK':'ERR')+'</span></td>'+
        '<td style="color:var(--mid);font-size:11px;white-space:nowrap">'+time+'</td>';
      tbody.appendChild(tr);
    });
  }
}

// ── Clear usage data ──────────────────────────────────────────
function clearUsageData(){
  if(!confirm('Clear all usage history? This cannot be undone.')) return;
  localStorage.removeItem(USAGE_KEY);
  renderUsage();
  showToast('Usage history cleared');
}

(function(){
  renderHist();
  var h=loadHist();
  if(h.length){loadEco(h[0].id);}
})();

// Auto-init on load
if(typeof loadHistory === 'function') loadHistory();
`
