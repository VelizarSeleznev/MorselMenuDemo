'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Leaf,
  Mic,
  Menu,
  X,
  Minus,
  Plus,
  ShoppingBag,
  Rotate3D,
  Utensils,
  Coffee,
  GlassWater,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useArrivalDrawer } from '@/components/use-arrival-drawer';
import FoodModel from '@/components/food-model';
import VoiceAssistant, {
  type VoiceAssistantHandle,
} from '@/components/voice-assistant';
import {
  menu,
  priceFor,
  variantFor,
  type Dish,
  type Portion,
} from '@/lib/menu';
import { validLines, type BasketLine } from '@/lib/assistant';
import { useLocale } from '@/lib/i18n';
import { languages, type Language } from '@/lib/voice-settings';
const categories = ['All dishes', 'Mains', 'Sides', 'Desserts', 'Drinks'];
export default function Home() {
  const { language, setLanguage, t } = useLocale();
  const voiceRef = useRef<VoiceAssistantHandle>(null);
  const [category, setCategory] = useState('All dishes'),
    [vegetarian, setVegetarian] = useState(false);
  const [selected, setSelected] = useState<Dish | null>(null),
    [portion, setPortion] = useState<Portion>('small'),
    [note, setNote] = useState('');
  const [cart, setCart] = useState<BasketLine[]>([]),
    [cartOpen, setCartOpen] = useState(false),
    [review, setReview] = useState(false),
    [resetOpen, setResetOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<
    { id: string; portion: Portion }[]
  >([]);
  const [showPicks, setShowPicks] = useState(true);
  const recommendedPortion = (id: string) =>
    recommendations.find((item) => item.id === id)?.portion || 'small';
  const [assistantOpen, setAssistantOpen] = useState(false),
    [notice, setNotice] = useState('');
  const [arrivalOpen, setArrivalOpen] = useState(true);
  function openArrival() {
    setAssistantOpen(false);
    setArrivalOpen(true);
  }
  useEffect(() => {
    if (!arrivalOpen) return;
    const initialY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - initialY) > 8) setArrivalOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArrivalOpen(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
    };
  }, [arrivalOpen]);
  const drawer = useArrivalDrawer(arrivalOpen && !assistantOpen, (next) => {
    if (next) openArrival(); else setArrivalOpen(false);
  });
  const focusedMenu = assistantOpen && showPicks && recommendations.length > 0;
  const cartRef = useRef<BasketLine[]>([]),
    versionRef = useRef(0);
  function commitCart(lines: BasketLine[]) {
    cartRef.current = lines;
    versionRef.current++;
    setCart(lines);
    try {
      sessionStorage.setItem('morsel-cart', JSON.stringify(lines));
    } catch {}
  }
  useEffect(() => {
    try {
      const lines = JSON.parse(sessionStorage.getItem('morsel-cart') || '[]');
      if (validLines(lines)) commitCart(lines);
    } catch {}
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  const total = cart.reduce(
      (s, l) =>
        s +
        priceFor(
          menu.find((d) => d.id === l.id)!,
          l.portion,
        ) *
          l.quantity,
      0,
    ),
    count = cart.reduce((s, l) => s + l.quantity, 0);
  function enter(voice = false) {
    try {
      sessionStorage.setItem('morsel-started', 'yes');
    } catch {}
    setArrivalOpen(false);
    if (voice) voiceRef.current?.start();
  }
  function freshOrder() {
    voiceRef.current?.reset();
    setAssistantOpen(false);
    setArrivalOpen(true);
    commitCart([]);
    setSelected(null);
    setCartOpen(false);
    setReview(false);
    setResetOpen(false);
    setCategory('All dishes');
    setVegetarian(false);
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'instant' });
    try {
      sessionStorage.removeItem('morsel-started');
    } catch {}
  }
  function add(id: string, p: Portion, prep?: string) {
    const old = cartRef.current,
      exists = old.find((l) => l.id === id && l.portion === p);
    commitCart(
      exists
        ? old.map((l) =>
            l === exists
              ? {
                  ...l,
                  quantity: Math.min(20, l.quantity + 1),
                  ...(prep !== undefined ? { note: prep } : {}),
                }
              : l,
          )
        : [
            ...old,
            { id, portion: p, quantity: 1, ...(prep ? { note: prep } : {}) },
          ],
    );
    setNotice(t('Added to your order'));
  }
  function change(id: string, p: Portion, delta: number) {
    commitCart(
      cartRef.current
        .map((l) =>
          l.id === id && l.portion === p
            ? { ...l, quantity: Math.min(20, l.quantity + delta) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }
  function openDish(d: Dish, p: Portion = 'small') {
    setSelected(d);
    setPortion(p);
    setNote(
      cartRef.current.find((l) => l.id === d.id && l.portion === p)?.note || '',
    );
  }
  function art(d: Dish, interactive = false) {
    return d.model ? (
      <FoodModel
        model={d.model}
        name={t(d.name)}
        interactive={interactive}
        portion={
          interactive
            ? portion
            : focusedMenu
              ? recommendedPortion(d.id)
              : 'small'
        }
      />
    ) : (
      <div className="drink-art">
        {d.id === 'coffee' ? <Coffee size={92} /> : <GlassWater size={92} />}
      </div>
    );
  }
  return (
    <div
      className={`app-shell open-menu ${assistantOpen ? 'with-assistant' : ''} ${focusedMenu ? 'showing-picks' : ''}`}
    >
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => {
            openArrival();
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
        >
          morsel<span>•</span>
        </button>
        <div className="restaurant">{t('kitchen & good company')}</div>
        <button
          className="voice-settings-link"
          onClick={() => voiceRef.current?.settings()}
        >
          ⚙ {t('Voice & language')}
        </button>
        <button
          className="menu-toggle"
          aria-expanded={arrivalOpen && !assistantOpen}
          aria-controls="arrival-panel"
          onClick={() => arrivalOpen && !assistantOpen ? setArrivalOpen(false) : openArrival()}
        >
          <Menu size={18} /> {t('Menu')}
        </button>
        <div className="table-label">
          {t('Table')} <strong>04</strong>
        </div>
      </header>
      <div ref={drawer.edge} className="drawer-edge" aria-hidden="true" />
      <aside ref={drawer.panel} id="arrival-panel" className={`arrival-rail ${arrivalOpen && !assistantOpen ? 'is-open' : ''}`}
        aria-label={t('Language')} aria-hidden={!arrivalOpen || assistantOpen} inert={!arrivalOpen || assistantOpen}>
          <button className="arrival-close" aria-label={t('Close')} onClick={() => setArrivalOpen(false)}><X size={18} /></button>
          <div className="arrival-language">
            <span className="rail-eyebrow">{t('Make yourself at home')}</span>
            <div className="arrival-languages">
              {Object.entries(languages).map(([code, label]) => (
                <button
                  key={code}
                  lang={code}
                  aria-pressed={language === code}
                  onClick={() => { setLanguage(code as Language); setArrivalOpen(false); }}
                >
                  <span>{label}</span>
                  <span aria-hidden="true">
                    {language === code ? '✓' : '↗'}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button
            className="companion-portal"
            onClick={() => enter(true)}
            aria-label={t('Talk to your menu companion')}
          >
            <span className="companion-wave" aria-hidden="true"><span /><span /><span /><span /><span /></span>
            <span className="portal-kicker">morsel live</span>
            <strong>{t('Let’s find your favourite')}</strong>
            <span className="portal-description">
              {t('Tell me what sounds good.')}
            </span>
            <span className="portal-action">
              {t('Tap to talk')} <ArrowRight size={16} />
            </span>
          </button>
          <button className="rail-new-order" onClick={() => setResetOpen(true)}>
            {t('Start a new order')}
          </button>
        </aside>
      <>
        <main>
          <div className="menu-toolbar">
            <div
              className="category-list"
              role="group"
              aria-label={t('Categories')}
            >
              {categories.map((c) => (
                <button
                  key={c}
                  className={`category ${category === c ? 'active' : ''}`}
                  aria-pressed={category === c}
                  onClick={() => {
                    setCategory(c);
                    setShowPicks(false);
                  }}
                >
                  {t(c)}
                </button>
              ))}
            </div>
            <button
              className={`diet-filter ${vegetarian ? 'active' : ''}`}
              aria-pressed={vegetarian}
              onClick={() => setVegetarian(!vegetarian)}
            >
              <Leaf size={16} />
              {t('Vegetarian')}
            </button>
          </div>
          {assistantOpen && recommendations.length > 0 && (
            <div className="recommendation-heading">
              <div>
                <span>{t('YOUR MENU COMPANION')}</span>
                <h2>
                  {t(focusedMenu ? 'Picked for you' : 'Explore the menu')}
                </h2>
              </div>
              <button onClick={() => setShowPicks(!showPicks)}>
                {t(focusedMenu ? 'Show all dishes' : 'Show suggestions')}
              </button>
            </div>
          )}
          <div className="dish-grid">
            {menu
              .filter((d) =>
                focusedMenu
                  ? recommendations.some((item) => item.id === d.id)
                  : (category === 'All dishes' || d.category === category) &&
                    (!vegetarian || d.vegetarian),
              )
              .map((d, i) => (
                <article
                  className="dish-card"
                  key={d.id}
                  style={
                    {
                      '--dish-color': d.color,
                      '--delay': `${i * 40}ms`,
                    } as React.CSSProperties
                  }
                >
                  <button
                    className="dish-art"
                    onClick={() =>
                      openDish(
                        d,
                        focusedMenu ? recommendedPortion(d.id) : 'small',
                      )
                    }
                    aria-label={t(d.name)}
                  >
                    <span className="dish-tag">
                      {d.vegetarian && <Leaf size={13} />} {t(d.tag)}
                    </span>
                    {art(d)}
                    {d.model && (
                      <span className="orbit-label">
                        <Rotate3D size={15} />
                        3D
                      </span>
                    )}
                    <span className="open-dish">
                      <ArrowRight size={21} />
                    </span>
                  </button>
                  <div className="dish-info">
                    <div className="dish-heading">
                      <button
                        onClick={() =>
                          openDish(
                            d,
                            focusedMenu ? recommendedPortion(d.id) : 'small',
                          )
                        }
                      >
                        <h2>{t(d.name)}</h2>
                      </button>
                      <span>
                        {!focusedMenu && <small>{t('from')} </small>}
                        {focusedMenu
                          ? priceFor(d, recommendedPortion(d.id))
                          : d.smallPrice}{' '}
                        <small>kr</small>
                      </span>
                    </div>
                    <p>{t(d.subtitle)}</p>
                    {focusedMenu && (
                      <p className="suggested-portion">
                        {t(variantFor(d, recommendedPortion(d.id)))}
                      </p>
                    )}
                    <div className="dish-bottom">
                      <span>
                        <Clock size={13} />
                        {d.minutes} {t('min')}
                      </span>
                      <button
                        className="portion-link"
                        onClick={() =>
                          openDish(
                            d,
                            focusedMenu ? recommendedPortion(d.id) : 'small',
                          )
                        }
                      >
                        {t('Choose')} <Plus size={17} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
          </div>
          <footer className="menu-footer">
            <span>{t('Good food. Your portion. Your pace.')}</span>
            <span>{t('Prices in DKK · Sample menu')}</span>
          </footer>
        </main>
        <div className="bottom-dock">
          {!assistantOpen && <button className="voice-launcher" onClick={() => enter(true)} aria-label={t('Start voice conversation')}>
            <span className="companion-wave compact" aria-hidden="true"><span /><span /><span /><span /><span /></span>
            <span>{t('Tap to talk')}</span>
          </button>}

          <button
            className="cart-button"
            onClick={() => {
              setReview(false);
              setCartOpen(true);
            }}
          >
            <ShoppingBag size={20} />
            <span>{t('My order')}</span>
            <span className="cart-count">{count}</span>
            <strong>{total} kr</strong>
            <ChevronRight size={18} />
          </button>
        </div>
      </>
      {notice && (
        <div className="notice" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="dish-dialog">
          {selected && (
            <>
              <div
                className="detail-art"
                style={{ background: selected.color }}
              >
                <span className="detail-tag">{t(selected.tag)}</span>
                {art(selected, true)}
                {selected.model && (
                  <span className="drag-hint">
                    <Rotate3D size={17} />
                    {t('Drag to take a look around')}
                  </span>
                )}
              </div>
              <div className="detail-content">
                <div className="eyebrow">
                  {t(selected.category)} · {selected.minutes} {t('min')}
                </div>
                <DialogTitle className="detail-title">
                  {t(selected.name)}
                </DialogTitle>
                <DialogDescription className="detail-description">
                  {t(selected.ingredients)}
                </DialogDescription>
                <div className="portion-caption">{t('Make it yours')}</div>
                <div
                  className="portion-options"
                  role="group"
                  aria-label={t('Choose your serving')}
                >
                  {(['small', 'regular'] as Portion[]).map((p) => (
                    <button
                      key={p}
                      aria-pressed={portion === p}
                      className={`portion-option ${portion === p ? 'chosen' : ''}`}
                      onClick={() => {
                        setPortion(p);
                        setNote(
                          cartRef.current.find(
                            (l) => l.id === selected.id && l.portion === p,
                          )?.note || '',
                        );
                      }}
                    >
                      <strong>{t(variantFor(selected, p))}</strong>
                      <span>{priceFor(selected, p)} kr</span>
                    </button>
                  ))}
                </div>
                <label className="preparation-label">
                  {t('Any preferences?')}
                  <input
                    value={note}
                    maxLength={240}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('Any requests?')}
                    className="dish-note-input"
                  />
                </label>
                <div className="preparation-chips">
                  {selected.requests?.map((r) => (
                    <button
                      key={r}
                      onClick={() =>
                        setNote((old) =>
                          old.includes(t(r))
                            ? old
                            : old
                              ? old + ', ' + t(r)
                              : t(r),
                        )
                      }
                    >
                      {t(r)} <Plus size={12} />
                    </button>
                  ))}
                </div>
                <p className="allergens">
                  {t('Allergens')}:{' '}
                  {selected.allergens.length
                    ? selected.allergens.map(t).join(', ')
                    : t('None listed')}
                  . {t('Ask your server about allergies and substitutions.')}
                </p>
                <p className="model-disclaimer">
                  {t('Demo menu · requests are confirmed by your server.')}
                </p>
                <button
                  className="primary-button"
                  onClick={() => {
                    add(selected.id, portion, note);
                    setSelected(null);
                  }}
                >
                  {t('Add to my order')}
                  <strong>
                    {priceFor(selected, portion)} kr <Plus size={19} />
                  </strong>
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <VoiceAssistant
        ref={voiceRef}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        onRecommendations={(items) => {
          setRecommendations(items);
          setShowPicks(true);
          if (items.length) window.scrollTo({ top: 0, behavior: 'instant' });
        }}
        getContext={() => ({
          basket: cartRef.current,
          version: versionRef.current,
          selectedDish: selected?.id || null,
          selectedPortion: portion,
        })}
        onBasket={(lines) => {
          commitCart(lines);
          setNotice(t('Order updated'));
        }}
        onDish={openDish}
        onAdd={add}
        onShowBasket={() => {
          setReview(false);
          setCartOpen(true);
        }}
      />
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="cart-dialog">
          <DialogTitle className="cart-title">
            {t(review ? 'Your order is ready' : 'Your order')}{' '}
            <span>{count}</span>
          </DialogTitle>
          <DialogDescription>
            {t(
              review
                ? 'Show this screen to your server to place your order.'
                : 'Everything you picked, just how you like it.',
            )}
          </DialogDescription>
          {cart.length ? (
            <>
              <div className="cart-lines">
                {cart.map((l) => {
                  const d = menu.find((d) => d.id === l.id)!;
                  return (
                    <div className="cart-line" key={l.id + l.portion}>
                      <div>
                        <strong>{t(d.name)}</strong>
                        <span>{t(variantFor(d, l.portion))}</span>
                        {review ? (
                          <p className="order-prep">{l.note}</p>
                        ) : (
                          <input
                            aria-label={t('Preparation note') + ' ' + t(d.name)}
                            placeholder={t('Any requests?')}
                            value={l.note || ''}
                            maxLength={240}
                            className="dish-note-input"
                            onChange={(e) =>
                              commitCart(
                                cartRef.current.map((row) =>
                                  row.id === l.id && row.portion === l.portion
                                    ? { ...row, note: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        )}
                      </div>
                      <div className="line-right">
                        <strong>
                          {priceFor(d, l.portion) * l.quantity} kr
                        </strong>
                        {review ? (
                          <span>× {l.quantity}</span>
                        ) : (
                          <div className="quantity">
                            <button
                              aria-label={t('Remove one') + ' ' + t(d.name)}
                              onClick={() => change(l.id, l.portion, -1)}
                            >
                              <Minus size={15} />
                            </button>
                            <span>{l.quantity}</span>
                            <button
                              aria-label={t('Add one') + ' ' + t(d.name)}
                              onClick={() => change(l.id, l.portion, 1)}
                            >
                              <Plus size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="cart-total">
                <span>{t('Total')}</span>
                <strong>{total} kr</strong>
              </div>
              <div className="order-note">
                <Utensils size={20} />
                <p>
                  {t(
                    review
                      ? 'Table 04 · Thank you!'
                      : 'You can review everything before ordering.',
                  )}
                  <br />
                  <span>
                    {t('Demo only — nothing is sent to the kitchen.')}
                  </span>
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => setReview(!review)}
              >
                {t(review ? 'Edit my order' : 'Ready to order')}
                <ArrowRight size={20} />
              </button>
              {review && (
                <button
                  className="new-order-link"
                  onClick={() => setResetOpen(true)}
                >
                  {t('Start a new order')}
                </button>
              )}
            </>
          ) : (
            <div className="empty-cart">
              <ShoppingBag size={40} />
              <h3>{t('An empty plate, for now')}</h3>
              <p>{t('Find something you love on the menu.')}</p>
              <button
                className="primary-button"
                onClick={() => setCartOpen(false)}
              >
                {t('Explore the menu')}
                <ArrowRight size={20} />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="voice-settings-dialog">
          <DialogTitle>{t('A fresh start?')}</DialogTitle>
          <DialogDescription>
            {t('This clears the order and conversations for the next guest.')}
          </DialogDescription>
          <button className="primary-button" onClick={freshOrder}>
            {t('Start a new order')}
          </button>
          <button
            className="new-order-link"
            onClick={() => setResetOpen(false)}
          >
            {t('Keep this order')}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
