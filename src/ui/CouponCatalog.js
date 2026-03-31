import { COUPON_CARDS } from '../data/couponCards.js';
import { drawCardFace, CARD_TEX_W, CARD_TEX_H, CARD_DETAIL_W, CARD_DETAIL_H, CAT_ICONS, RARITY_LABEL } from '../rendering/CouponCardDraw.js';
import { InputGuard } from '../core/InputGuard.js';

/**
 * 쿠폰 도감 — 전체 화면 스크롤 그리드 오버레이.
 * 덱 클릭 시 표시, 모든 쿠폰 카드 목록 + 획득 여부 표시.
 */

// 도감 표시 크기 (CSS px) — 비율 고정 280:192
const CARD_W = 252;
const CARD_H = Math.round(CARD_W * CARD_TEX_H / CARD_TEX_W);  // ≈173

export class CouponCatalog {
  constructor() {
    this._ownedIds = new Set();
    this._activeFilter = null;  // null = 전체
    this._build();
  }

  // ── 공개 API ──

  show(ownedCards = []) {
    this._ownedIds = new Set(ownedCards.map(c => c.id));
    this._activeFilter = null;
    this._renderGrid();
    this._el.style.display = 'flex';
    this._grid.scrollTop = 0;
    InputGuard.block();       // 인게임 3D 입력 차단
  }

  hide() {
    this._el.style.display = 'none';
    InputGuard.unblock();     // 차단 해제
  }

  get isOpen() { return this._el.style.display !== 'none'; }

  // ── DOM 구성 ──

  _build() {
    this._el = document.createElement('div');
    Object.assign(this._el.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(4, 4, 14, 0.92)',
      backdropFilter: 'blur(10px)',
      zIndex: '300',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'stretch',
      fontFamily: 'system-ui, sans-serif',
    });

    // ── 헤더 ──
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 28px 12px',
      borderBottom: '1px solid rgba(80,100,160,0.35)',
      flexShrink: '0',
    });

    const title = document.createElement('div');
    title.textContent = '쿠폰 도감';
    Object.assign(title.style, {
      fontSize: '24px', fontWeight: 'bold', color: '#aabbdd',
      letterSpacing: '2px',
    });

    const countEl = document.createElement('div');
    countEl.id = '_catalog_count';
    Object.assign(countEl.style, { fontSize: '14px', color: '#667788' });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕  닫기';
    Object.assign(closeBtn.style, {
      background: 'rgba(60,70,100,0.55)', border: '1px solid rgba(100,120,180,0.4)',
      color: '#aabbdd', padding: '8px 18px', borderRadius: '8px',
      fontSize: '14px', cursor: 'pointer',
    });
    closeBtn.onpointerenter = () => closeBtn.style.background = 'rgba(80,100,140,0.7)';
    closeBtn.onpointerleave = () => closeBtn.style.background = 'rgba(60,70,100,0.55)';
    closeBtn.onclick = () => this.hide();

    header.append(title, countEl, closeBtn);

    // ── 카테고리 필터 탭 ──
    const filterBar = document.createElement('div');
    Object.assign(filterBar.style, {
      display: 'flex', gap: '8px', padding: '10px 28px',
      borderBottom: '1px solid rgba(60,80,110,0.3)',
      flexShrink: '0', flexWrap: 'wrap',
    });

    const categories = ['전체', ...Object.keys(CAT_ICONS)];
    this._filterBtns = {};
    for (const cat of categories) {
      const btn = document.createElement('button');
      const icon = CAT_ICONS[cat] ?? '';
      btn.textContent = icon ? `${icon} ${cat}` : cat;
      btn.dataset.cat = cat;
      Object.assign(btn.style, {
        background: 'rgba(30,35,55,0.7)', border: '1px solid rgba(70,90,130,0.4)',
        color: '#8899bb', padding: '6px 14px', borderRadius: '20px',
        fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s',
      });
      btn.onclick = () => this._setFilter(cat === '전체' ? null : cat);
      btn.onpointerenter = () => { if (btn.dataset.active !== '1') btn.style.background = 'rgba(50,60,90,0.7)'; };
      btn.onpointerleave = () => { if (btn.dataset.active !== '1') btn.style.background = 'rgba(30,35,55,0.7)'; };
      filterBar.appendChild(btn);
      this._filterBtns[cat] = btn;
    }

    // ── 카드 그리드 ──
    this._grid = document.createElement('div');
    Object.assign(this._grid.style, {
      flex: '1', overflowY: 'auto', overflowX: 'hidden',
      padding: '20px 32px 40px',
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))`,
      gap: '20px',
      alignContent: 'start',
    });

    // 스크롤바 커스텀
    const style = document.createElement('style');
    style.textContent = `
      #_coupon_catalog_grid::-webkit-scrollbar { width: 6px; }
      #_coupon_catalog_grid::-webkit-scrollbar-track { background: rgba(10,12,22,0.5); }
      #_coupon_catalog_grid::-webkit-scrollbar-thumb { background: rgba(80,100,160,0.4); border-radius: 3px; }
    `;
    this._grid.id = '_coupon_catalog_grid';
    document.head.appendChild(style);

    // 배경 클릭으로 닫기 (그리드 외부)
    this._el.onclick = (e) => { if (e.target === this._el) this.hide(); };

    this._el.append(header, filterBar, this._grid);
    document.body.appendChild(this._el);

    this._countEl = countEl;
  }

  // ── 필터 ──

  _setFilter(cat) {
    this._activeFilter = cat;
    this._renderGrid();
  }

  _updateFilterBtns() {
    for (const [key, btn] of Object.entries(this._filterBtns)) {
      const active = (this._activeFilter === null && key === '전체') ||
                     this._activeFilter === key;
      btn.dataset.active = active ? '1' : '0';
      btn.style.background = active ? 'rgba(60,80,160,0.75)' : 'rgba(30,35,55,0.7)';
      btn.style.borderColor = active ? 'rgba(100,140,220,0.6)' : 'rgba(70,90,130,0.4)';
      btn.style.color = active ? '#cce0ff' : '#8899bb';
    }
  }

  // ── 카드 그리드 렌더 ──

  _renderGrid() {
    this._updateFilterBtns();
    this._grid.innerHTML = '';

    const filtered = COUPON_CARDS.filter(c =>
      this._activeFilter === null || c.category === this._activeFilter
    );

    const owned  = filtered.filter(c => this._ownedIds.has(c.id));
    const others = filtered.filter(c => !this._ownedIds.has(c.id));

    // 획득한 카드 먼저
    for (const card of [...owned, ...others]) {
      this._grid.appendChild(this._makeCardEl(card));
    }

    const total   = COUPON_CARDS.length;
    const gotAll  = this._ownedIds.size;
    this._countEl.textContent = `획득 ${gotAll} / 전체 ${total}`;
  }

  // ── 개별 카드 요소 ──

  _makeCardEl(cardDef) {
    const owned  = this._ownedIds.has(cardDef.id);
    const colors = cardDef.colors ?? ['#223355', '#445588'];
    const bright = colors[colors.length - 1];
    const icon   = CAT_ICONS[cardDef.category] || '🃏';

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'relative', borderRadius: '14px',
      overflow: 'hidden', cursor: 'default',
      transition: 'transform 0.15s, box-shadow 0.15s',
      boxShadow: owned
        ? `0 0 12px ${bright}55, 0 4px 16px rgba(0,0,0,0.6)`
        : '0 4px 12px rgba(0,0,0,0.5)',
    });
    wrapper.onpointerenter = () => {
      wrapper.style.transform = 'translateY(-4px) scale(1.02)';
      wrapper.style.boxShadow = `0 0 18px ${bright}66, 0 8px 24px rgba(0,0,0,0.7)`;
    };
    wrapper.onpointerleave = () => {
      wrapper.style.transform = '';
      wrapper.style.boxShadow = owned
        ? `0 0 12px ${bright}55, 0 4px 16px rgba(0,0,0,0.6)`
        : '0 4px 12px rgba(0,0,0,0.5)';
    };

    // 카드 캔버스 — Detail 해상도(560×384)로 그리고 CSS로 축소
    // large:true → 2× 폰트 크기로 선명한 텍스트
    const cv  = document.createElement('canvas');
    cv.width  = CARD_DETAIL_W;   // 560
    cv.height = CARD_DETAIL_H;   // 384
    cv.style.width   = `${CARD_W}px`;
    cv.style.height  = `${CARD_H}px`;
    cv.style.display = 'block';
    drawCardFace(cv.getContext('2d'), CARD_DETAIL_W, CARD_DETAIL_H, cardDef, { dim: !owned, large: true });
    wrapper.appendChild(cv);

    // 획득 배지
    if (owned) {
      const badge = document.createElement('div');
      badge.textContent = '획득';
      Object.assign(badge.style, {
        position: 'absolute', top: '10px', right: '10px',
        background: 'rgba(20,160,80,0.88)',
        color: '#aaffcc', fontSize: '13px', fontWeight: 'bold',
        padding: '4px 11px', borderRadius: '12px',
        border: '1px solid rgba(80,220,130,0.55)',
        letterSpacing: '0.5px',
      });
      wrapper.appendChild(badge);
    }

    return wrapper;
  }

  // 카드 드로잉은 CouponCardDraw.js 에서 통합 관리
}
