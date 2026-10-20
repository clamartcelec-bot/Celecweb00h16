import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { LoginModal } from '@/components/LoginModal';
import { PasswordResetModal } from '@/components/PasswordResetModal';
import { AdminDashboard } from '@/components/AdminDashboard';
import { ClientSpace } from '@/components/ClientSpace';
import { copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { normalizeBrandName, type CityGroup, type ContactCategory, type Lang, type Partner, type Photo, type Theme, type View } from '@/site/types';
import { SiteHeader } from '@/site/components/SiteHeader';
import { SiteFooter } from '@/site/components/SiteFooter';
import { MapPage } from '@/site/map/MapPage';
import { Hero } from '@/site/components/Hero';
import { ClientHome } from '@/site/components/ClientHome';
import { CarnetShowcase, PartnersStrip, StatsBand } from '@/site/components/HomeSections';
import { FamiliesSection, TerritorySection } from '@/site/components/HomeFamilies';
import { FamilyPage } from '@/site/pages/FamilyPage';
import { isFamilyKey, topicById, type FamilyKey } from '@/site/taxonomy';
import { ContactSection } from '@/site/components/ContactSection';
import { useConcierge, type ConciergeAction, type ConciergeContext } from '@/site/concierge/useConcierge';
import { RobotDock } from '@/site/concierge/RobotDock';
import { ConciergeChat } from '@/site/concierge/ConciergeChat';
import { EntrySheet } from '@/site/components/EntrySheet';
import { BrandSheet } from '@/site/components/BrandSheet';
import { CallbackSheet } from '@/site/components/CallbackSheet';
import { CarnetPage } from '@/site/pages/CarnetPage';
import { PartnersPage } from '@/site/pages/PartnersPage';
import { BlockTechPage } from '@/site/pages/BlockTechPage';
import { AdminLogin } from '@/site/pages/AdminLogin';
import { HomeV2 } from '@/site/pages/HomeV2';
import { useSiteVariant } from '@/site/variant';
import { AssistantBar, AssistantGuideCursor } from '@/site/concierge/AssistantBar';
import { useGuideCursor } from '@/site/concierge/useGuideCursor';
import type { GuideHandlers } from '@/site/concierge/useRobotGuide';
import '@/site/site.css';

const PHOTO_SELECT = '*, photo_images(id, image_url, caption, position)';
const THEME_KEY = 'celec-theme';

function initialTheme(): Theme {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_KEY) : null;
  return saved === 'dark' ? 'dark' : 'light';
}

interface UserProfile {
  role: string | null;
  fullName: string | null;
  phone: string | null;
}

function firstName(fullName: string | null, email: string): string {
  const fromProfile = fullName?.trim().split(/\s+/)[0];
  if (fromProfile) return fromProfile;
  const local = email.split('@')[0].split(/[._-]/)[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function App() {
  const [lang, setLang] = useState<Lang>('fr');
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [view, setView] = useState<View>('home');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosStatus, setPhotosStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [familyKey, setFamilyKey] = useState<FamilyKey>('electricite');
  const [carnetTopic, setCarnetTopic] = useState<string | null>(null);
  const [carnetQuery, setCarnetQuery] = useState('');
  const [cityGroups, setCityGroups] = useState<CityGroup[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [contactCategory, setContactCategory] = useState<ContactCategory | null>(null);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [resetMode, setResetMode] = useState<'request' | 'update' | null>(null);
  const [resetExpired, setResetExpired] = useState(false);
  const [carnetDetail, setCarnetDetail] = useState<Photo | null>(null);
  const [brandView, setBrandView] = useState<{ name: string; partner: Partner | null } | null>(null);
  const [brandReturn, setBrandReturn] = useState<string | null>(null);
  const [fromChat, setFromChat] = useState(false);
  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [contactPrefill, setContactPrefill] = useState<{ text: string; phone: string; nonce: number } | null>(null);
  const pendingBrandRef = useRef<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clientSpace, setClientSpace] = useState<'overview' | 'requests' | null>(null);
  const t = copy[lang];
  const [variant, setVariant] = useSiteVariant();
  const guideHandlers: GuideHandlers = {
    go: (v, family) => runConciergeActions([{ type: 'navigate', view: v, family }]),
    topic: (id) => { setCarnetQuery(''); setCarnetTopic(id); },
    type: setCarnetQuery,
    openEntry: (id) => { const e = photos.find((p) => p.id === id); if (e) openCarnetDetail(e); },
    openPartner: (id) => { const p = partners.find((x) => x.id === id); if (p) openBrand(p.name, p); },
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, lang]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const loadProfile = async (userId: string) => {
      const { data: prof } = await client.from('profiles').select('role, full_name, phone').eq('id', userId).maybeSingle();
      setProfile(prof ? { role: prof.role ?? null, fullName: prof.full_name ?? null, phone: prof.phone ?? null } : null);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) {
        setUserEmail(data.session.user.email);
        void loadProfile(data.session.user.id);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // A recovery link opens a temporary session: use it to ask for the new password.
      if (event === 'PASSWORD_RECOVERY') {
        setLoginOpen(false);
        setResetExpired(false);
        setResetMode('update');
      }
      (async () => {
        setUserEmail(session?.user?.email ?? null);
        if (session?.user?.id) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
        }
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadPhotos = useCallback(() => {
    if (!supabase) { setPhotosStatus('error'); return; }
    setPhotosStatus('loading');
    supabase.from('photos').select(PHOTO_SELECT).eq('published', true).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error || !data) { setPhotosStatus('error'); return; }
      setPhotos(data);
      setPhotosStatus('ready');
      const groups: Record<string, CityGroup> = {};
      data.forEach((p: Photo) => {
        if (!p.city) return;
        if (!groups[p.city]) groups[p.city] = { city: p.city, count: 0, lat: p.lat, lng: p.lng };
        groups[p.city].count++;
      });
      setCityGroups(Object.values(groups).sort((a, b) => b.count - a.count));
    });
  }, []);

  useEffect(() => {
    loadPhotos();
    if (!supabase) return;
    supabase.from('partners').select('*').eq('published', true).order('position').then(({ data }) => {
      if (data) setPartners(data);
    });
  }, [loadPhotos]);

  const go = useCallback((v: View, anchor?: string) => {
    setView(v);
    if (anchor) {
      window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // Deep links from the concierge: ?concierge=<session> reopens the last presented
  // carnet entry, ?brand=<name> opens that brand sheet.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hash.get('error_code') === 'otp_expired' || hash.get('error') === 'access_denied') {
      setResetExpired(true);
      setResetMode('update');
    }
    const params = new URLSearchParams(window.location.search);
    const brand = params.get('brand');
    const famille = params.get('famille');
    const sujet = params.get('sujet');
    if (params.get('vue') === 'entretien') { go('entretien'); return; }
    if (isFamilyKey(famille)) { setFamilyKey(famille); go('family'); return; }
    if (sujet !== null) { setCarnetTopic(topicById(sujet) ? sujet : null); go('carnet'); return; }
    if (brand) {
      pendingBrandRef.current = brand;
      go('partners');
      return;
    }
    if (window.location.pathname === '/concierge') {
      window.history.replaceState(null, '', '/');
      setConciergeOpen(true);
    }
  }, [go]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view === 'family') params.set('famille', familyKey);
    if (view === 'entretien') params.set('vue', 'entretien');
    if (view === 'carnet') params.set('sujet', carnetTopic ?? '');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', next);
  }, [view, familyKey, carnetTopic]);

  const openFamily = useCallback((id: FamilyKey) => {
    if (id === 'entretien') { go('entretien'); return; }
    setFamilyKey(id);
    go('family');
  }, [go]);

  const openTopic = useCallback((id: string | null) => {
    setCarnetTopic(id);
    if (view !== 'carnet') go('carnet');
  }, [view, go]);

  const findPartnerForBrand = useCallback(
    (name: string) => partners.find((p) => normalizeBrandName(p.name) === normalizeBrandName(name)) ?? null,
    [partners],
  );

  const openBrand = useCallback((name: string, partner: Partner | null) => {
    setCarnetDetail(null);
    setBrandReturn(null);
    setBrandView({ name, partner });
  }, []);

  useEffect(() => {
    const brand = pendingBrandRef.current;
    if (!brand || partners.length === 0) return;
    pendingBrandRef.current = null;
    openBrand(brand, findPartnerForBrand(brand));
  }, [partners, openBrand, findPartnerForBrand]);

  const openCarnetDetail = (entry: Photo, fromBrand?: string) => {
    setFromChat(false);
    setBrandView(null);
    setBrandReturn(fromBrand ?? null);
    setCarnetDetail(entry);
  };

  const closeAllOverlays = () => {
    setFromChat(false);
    setCarnetDetail(null);
    setBrandView(null);
    setBrandReturn(null);
  };

  const brandEntries = brandView
    ? photos.filter((p) => (p.detected_brands ?? []).some((b) => normalizeBrandName(b) === normalizeBrandName(brandView.name)))
    : [];

  const enterConcierge = () => setConciergeOpen(true);

  const logout = async () => {
    await supabase?.auth.signOut();
    setUserEmail(null);
    setProfile(null);
    go('home');
  };

  const userRole = profile?.role ?? null;
  const isClient = Boolean(userEmail) && userRole === 'client';
  const userName = userEmail ? firstName(profile?.fullName ?? null, userEmail) : null;

  const pickCategory = (c: ContactCategory) => {
    setContactCategory(c);
    go('home', 'contact-box');
  };

  const runConciergeActions = (actions: ConciergeAction[]) => {
    for (const action of actions) {
      if (action.type === 'navigate') {
        setConciergeOpen(false);
        if (action.view === 'contact') go('home', 'contact-box');
        else if (action.view === 'family' && action.family && isFamilyKey(action.family)) openFamily(action.family);
        else if (action.view === 'carnet') openTopic(null);
        else if (['home', 'entretien', 'map', 'partners', 'blocktech'].includes(action.view)) go(action.view as View);
      } else if (action.type === 'filter_carnet' && topicById(action.topic)) {
        setConciergeOpen(false);
        setCarnetTopic(action.topic);
        go('carnet');
      } else if (action.type === 'prefill_contact') {
        setConciergeOpen(false);
        const details = [action.description, action.commune && `Commune : ${action.commune}`, action.first_name && `Prénom : ${action.first_name}`].filter(Boolean).join('\n');
        setContactCategory(action.category);
        setContactPrefill({ text: details, phone: action.phone, nonce: Date.now() });
        go('home', 'contact-box');
      }
    }
  };

  const conciergeContext = useCallback((): ConciergeContext => ({
    page: conciergeOpen ? 'concierge' : view,
    family: view === 'family' ? familyKey : undefined,
    topic: view === 'carnet' ? carnetTopic : undefined,
  }), [conciergeOpen, view, familyKey, carnetTopic]);
  const concierge = useConcierge({ photos, partners, userEmail, context: conciergeContext, onActions: runConciergeActions });
  const reduceMotion = false;
  const cursor = useGuideCursor(concierge.guide, concierge.guideDone, guideHandlers, reduceMotion);

  // Clôture automatique (V2) : quand le formulaire est envoyé, l'assistant est
  // informé, il interrompt, remercie et se rabaisse en boule.
  const onContactSubmitted = () => {
    concierge.stopSpeaking();
    concierge.setError(null);
    concierge.announceEvent('contact_sent');
  };

  const openFromChat = (entry: Photo) => {
    setConciergeOpen(false);
    setBrandView(null);
    setBrandReturn(null);
    setFromChat(true);
    setCarnetDetail(entry);
  };

  const partnerFromChat = (partner: Partner) => {
    setConciergeOpen(false);
    setFromChat(true);
    openBrand(partner.name, partner);
  };

  if (view === 'admin') {
    return <AdminDashboard onClose={() => go('home')} />;
  }

  const receding = conciergeOpen ? '1' : undefined;

  return (
    <>
    <div className="s-app" data-receding={receding} aria-hidden={conciergeOpen || undefined}>
      <SiteHeader
        t={t}
        lang={lang}
        theme={theme}
        variant={variant}
        onVariant={setVariant}
        view={view}
        userEmail={userEmail}
        userName={userName}
        onSignIn={() => setLoginOpen(true)}
        onSpace={() => setClientSpace('overview')}
        onHistory={() => setClientSpace('requests')}
        onLogout={() => void logout()}
        isAdmin={userRole === 'admin'}
        onLang={setLang}
        onTheme={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))}
        onNavigate={go}
        onConcierge={() => enterConcierge()}
      />

      <main className="s-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={view === 'family' ? `family-${familyKey}` : view}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            {view === 'home' && isClient && userName && (
              <>
                <ClientHome
                  t={t}
                  lang={lang}
                  name={userName}
                  onConcierge={enterConcierge}
                  onCallback={() => setCallbackOpen(true)}
                  onHistory={() => setClientSpace('requests')}
                  onRequest={() => go('home', 'contact-box')}
                />
                <CarnetShowcase t={t} photos={photos} onOpen={(e) => openCarnetDetail(e)} onSeeAll={() => go('carnet')} />
                <ContactSection
                  t={t}
                  category={contactCategory}
                  onCategory={setContactCategory}
                  userEmail={userEmail}
                  onLogin={() => setLoginOpen(true)}
                  prefill={contactPrefill}
                  transcribe={concierge.transcribe}
                />
              </>
            )}
            {view === 'home' && !isClient && variant === 'v1' && (
              <>
                <Hero
                  t={t}
                  photos={photos}
                  onCallback={() => setCallbackOpen(true)}
                  onSeeWork={() => openTopic(null)}
                  onCategory={pickCategory}
                  onMap={() => go('map')}
                  onOpenEntry={(e) => openCarnetDetail(e)}
                />
                <StatsBand t={t} entries={photos.length} cities={cityGroups.length} partners={partners.length} />
                <FamiliesSection
                  photos={photos}
                  onFamily={openFamily}
                  onEntretien={() => go('entretien')}
                  onCategory={pickCategory}
                  onBlockTech={() => go('blocktech')}
                  blocktechNote={t.blocktechNote}
                />
                <CarnetShowcase t={t} photos={photos} onOpen={(e) => openCarnetDetail(e)} onSeeAll={() => openTopic(null)} />
                <TerritorySection t={t} photos={photos} onOpen={(e) => openCarnetDetail(e)} onExpand={() => go('map')} />
                <PartnersStrip t={t} partners={partners} onOpen={(p) => openBrand(p.name, p)} onSeeAll={() => go('partners')} />
                <ContactSection
                  t={t}
                  category={contactCategory}
                  onCategory={setContactCategory}
                  userEmail={userEmail}
                  onLogin={() => setLoginOpen(true)}
                  prefill={contactPrefill}
                  transcribe={concierge.transcribe}
                />
              </>
            )}
            {view === 'home' && !isClient && variant !== 'v1' && (
              <>
                <HomeV2
                  photos={photos}
                  cityGroups={cityGroups}
                  partners={partners}
                  onCallback={() => setCallbackOpen(true)}
                  onSeeCarnet={() => openTopic(null)}
                  onFamily={(id) => openFamily(id as FamilyKey)}
                  onOpenEntry={(e) => openCarnetDetail(e)}
                  onOpenPartner={(p) => openBrand(p.name, p)}
                  onSeePartners={() => go('partners')}
                />
                {variant === 'v2' && (
                  <ContactSection
                    t={t}
                    category={contactCategory}
                    onCategory={setContactCategory}
                    userEmail={userEmail}
                    onLogin={() => setLoginOpen(true)}
                    prefill={contactPrefill}
                    transcribe={concierge.transcribe}
                    onSubmitted={onContactSubmitted}
                  />
                )}
              </>
            )}
            {view === 'map' && <MapPage t={t} photos={photos} onOpen={(e) => openCarnetDetail(e)} onBack={() => go('home', 'carte')} />}
            {(view === 'family' || view === 'entretien') && (
              <FamilyPage
                family={view === 'entretien' ? 'entretien' : familyKey}
                photos={photos}
                onOpen={(e) => openCarnetDetail(e)}
                onFamily={openFamily}
                onTopic={openTopic}
                onCategory={pickCategory}
              />
            )}
            {view === 'carnet' && (
              <CarnetPage
                t={t}
                photos={photos}
                status={photosStatus}
                onRetry={loadPhotos}
                topic={carnetTopic}
                onTopic={setCarnetTopic}
                query={carnetQuery}
                onQuery={setCarnetQuery}
                onOpen={(e) => openCarnetDetail(e)}
              />
            )}
            {view === 'partners' && <PartnersPage t={t} partners={partners} onOpen={(p) => openBrand(p.name, p)} onBlockTech={() => go('blocktech')} />}
            {view === 'blocktech' && <BlockTechPage t={t} />}
            {view === 'admin-login' && (
              <AdminLogin t={t} onSuccess={() => go('admin')} onForgot={() => { setResetExpired(false); setResetMode('request'); }} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <SiteFooter t={t} onNavigate={go} onConcierge={() => enterConcierge()} />

      <AnimatePresence>
        {carnetDetail && (
          <EntrySheet
            key={`entry-${carnetDetail.id}`}
            t={t}
            entry={carnetDetail}
            userEmail={userEmail}
            brandReturn={brandReturn}
            onConciergeReturn={fromChat ? () => { closeAllOverlays(); setConciergeOpen(true); } : undefined}
            isLinkedBrand={(b) => Boolean(findPartnerForBrand(b))}
            onBrand={(b) => openBrand(b, findPartnerForBrand(b))}
            onBackToBrand={() => brandReturn && openBrand(brandReturn, findPartnerForBrand(brandReturn))}
            onClose={closeAllOverlays}
          />
        )}
        {brandView && (
          <BrandSheet
            key={`brand-${brandView.name}`}
            t={t}
            name={brandView.name}
            partner={brandView.partner}
            entries={brandEntries}
            userEmail={userEmail}
            onConciergeReturn={fromChat ? () => { closeAllOverlays(); setConciergeOpen(true); } : undefined}
            onOpenEntry={(e) => openCarnetDetail(e, brandView.name)}
            onClose={closeAllOverlays}
          />
        )}
        {callbackOpen && <CallbackSheet key="callback" t={t} initialPhone={profile?.phone ?? ''} onClose={() => setCallbackOpen(false)} />}
      </AnimatePresence>

      {loginOpen && (
        <LoginModal
          lang={lang}
          onClose={() => setLoginOpen(false)}
          onAuthed={() => {}}
          onForgot={() => { setLoginOpen(false); setResetExpired(false); setResetMode('request'); }}
        />
      )}
      {resetMode && (
        <PasswordResetModal
          lang={lang}
          mode={resetMode}
          linkExpired={resetExpired}
          onClose={() => { setResetMode(null); setResetExpired(false); }}
          onAuthed={() => { setResetMode(null); setResetExpired(false); setLoginOpen(false); }}
        />
      )}
      {clientSpace && (
        <ClientSpace initialTab={clientSpace} onClose={() => setClientSpace(null)} onLogout={() => { setUserEmail(null); setProfile(null); }} />
      )}
    </div>

    <AnimatePresence>
      {conciergeOpen && (
        <ConciergeChat
          key="concierge"
          api={concierge}
          photos={photos}
          partners={partners}
          signedIn={Boolean(userEmail)}
          onOpenEntry={openFromChat}
          onOpenPartner={partnerFromChat}
          onClose={() => setConciergeOpen(false)}
        />
      )}
    </AnimatePresence>

    {view !== 'admin-login' && variant === 'v1' && (
      <RobotDock
        api={concierge}
        lang={lang}
        page={view}
        userName={isClient ? userName : null}
        chatOpen={conciergeOpen}
        photos={photos}
        partners={partners}
        onOpenEntry={(e) => (conciergeOpen ? openFromChat(e) : openCarnetDetail(e))}
        onOpenPartner={(p) => (conciergeOpen ? partnerFromChat(p) : openBrand(p.name, p))}
        onOpenChat={enterConcierge}
        guide={guideHandlers}
      />
    )}
    {view !== 'admin-login' && variant !== 'v1' && (
      <>
        <AssistantGuideCursor x={cursor.x} y={cursor.y} active={cursor.active} pressing={cursor.pressing} />
        <AssistantBar
          api={concierge}
          userName={isClient ? userName : null}
          photos={photos}
          partners={partners}
          onOpenEntry={(e) => openCarnetDetail(e)}
          onOpenPartner={(p) => openBrand(p.name, p)}
        />
      </>
    )}
    </>
  );
}

export default App;
