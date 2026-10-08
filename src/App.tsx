import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LoginModal } from '@/components/LoginModal';
import { PasswordResetModal } from '@/components/PasswordResetModal';
import { AdminDashboard } from '@/components/AdminDashboard';
import { ClientSpace } from '@/components/ClientSpace';
import { CONCIERGE_SESSION_PARAM } from '@/lib/conciergeSession';
import { findPresentedEntry } from '@/concierge/services/presence';
import { copy } from '@/site/content';
import { EASE_OUT } from '@/site/motion';
import { normalizeBrandName, type CityGroup, type ContactCategory, type Lang, type Partner, type Photo, type Theme, type View } from '@/site/types';
import { SiteHeader } from '@/site/components/SiteHeader';
import { SiteFooter } from '@/site/components/SiteFooter';
import { MapPage } from '@/site/map/MapPage';
import { Hero } from '@/site/components/Hero';
import { ClientHome } from '@/site/components/ClientHome';
import { AccountMenu } from '@/site/components/AccountMenu';
import { CarnetShowcase, MapSection, PartnersStrip, ServicesSection, StatsBand, TeamSection } from '@/site/components/HomeSections';
import { ContactSection } from '@/site/components/ContactSection';
import { ConciergeTransition } from '@/site/components/ConciergeTransition';
import { ConciergePage } from '@/concierge/components/ConciergePage';
import { EntrySheet } from '@/site/components/EntrySheet';
import { BrandSheet } from '@/site/components/BrandSheet';
import { CallbackSheet } from '@/site/components/CallbackSheet';
import { CarnetPage } from '@/site/pages/CarnetPage';
import { PartnersPage } from '@/site/pages/PartnersPage';
import { BlockTechPage } from '@/site/pages/BlockTechPage';
import { AdminLogin } from '@/site/pages/AdminLogin';
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
  const [conciergeReturn, setConciergeReturn] = useState<string | null>(null);
  const [portal, setPortal] = useState<{ x: number; y: number } | null>(null);
  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [conciergeLive, setConciergeLive] = useState(false);
  const pendingBrandRef = useRef<string | null>(null);
  const pendingConciergeEntry = useRef(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clientSpace, setClientSpace] = useState<'overview' | 'requests' | null>(null);
  const t = copy[lang];

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

  useEffect(() => {
    if (!supabase) return;
    supabase.from('photos').select(PHOTO_SELECT).eq('published', true).order('created_at', { ascending: false }).then(({ data }) => {
      if (!data) return;
      setPhotos(data);
      const groups: Record<string, CityGroup> = {};
      data.forEach((p: Photo) => {
        if (!p.city) return;
        if (!groups[p.city]) groups[p.city] = { city: p.city, count: 0, lat: p.lat, lng: p.lng };
        groups[p.city].count++;
      });
      setCityGroups(Object.values(groups).sort((a, b) => b.count - a.count));
    });
    supabase.from('partners').select('*').eq('published', true).order('position').then(({ data }) => {
      if (data) setPartners(data);
    });
  }, []);

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
    const conciergeSession = params.get(CONCIERGE_SESSION_PARAM);
    const brand = params.get('brand');
    if (brand) {
      pendingBrandRef.current = brand;
      go('partners');
      return;
    }
    if (conciergeSession) {
      pendingConciergeEntry.current = true;
      setConciergeReturn(conciergeSession);
      go('carnet');
    }
  }, [go]);

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

  useEffect(() => {
    if (!pendingConciergeEntry.current || !conciergeReturn) return;
    let active = true;
    findPresentedEntry(conciergeReturn).then(async (entry) => {
      if (!active || !entry) return;
      pendingConciergeEntry.current = false;
      let full: Photo | null = null;
      if (supabase) {
        const { data } = await supabase.from('photos').select(PHOTO_SELECT).eq('id', entry.id).eq('published', true).maybeSingle();
        full = data;
      }
      if (!active) return;
      setCarnetDetail(full ?? {
        id: entry.id,
        title: entry.title,
        city: entry.city,
        lat: 0,
        lng: 0,
        description: entry.description,
        author: 'CELEC',
        image_url: entry.image_url,
        created_at: new Date().toISOString(),
        detected_brands: entry.brands,
      });
    });
    return () => { active = false; };
  }, [conciergeReturn]);

  const openCarnetDetail = (entry: Photo, fromBrand?: string) => {
    setBrandView(null);
    setBrandReturn(fromBrand ?? null);
    setCarnetDetail(entry);
  };

  const closeAllOverlays = () => {
    setCarnetDetail(null);
    setBrandView(null);
    setBrandReturn(null);
  };

  const brandEntries = brandView
    ? photos.filter((p) => (p.detected_brands ?? []).some((b) => normalizeBrandName(b) === normalizeBrandName(brandView.name)))
    : [];

  const enterConcierge = (origin?: { x: number; y: number }) => {
    setPortal(origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  };

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

  if (view === 'admin') {
    return <AdminDashboard onClose={() => go('home')} />;
  }

  const receding = conciergeOpen ? (conciergeLive ? '2' : '1') : portal ? '1' : undefined;

  return (
    <>
    <div className="s-app" data-receding={receding} aria-hidden={conciergeOpen || undefined}>
      <SiteHeader
        t={t}
        lang={lang}
        theme={theme}
        view={view}
        account={
          <AccountMenu
            t={t}
            userEmail={userEmail}
            userName={userName}
            onSignIn={() => setLoginOpen(true)}
            onSpace={() => setClientSpace('overview')}
            onHistory={() => setClientSpace('requests')}
            onLogout={() => void logout()}
          />
        }
        isAdmin={userRole === 'admin'}
        onLang={setLang}
        onTheme={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))}
        onNavigate={go}
        onConcierge={() => enterConcierge()}
      />

      <main className="s-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
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
                />
              </>
            )}
            {view === 'home' && !isClient && (
              <>
                <Hero
                  t={t}
                  photos={photos}
                  onCallback={() => setCallbackOpen(true)}
                  onSeeWork={() => go('home', 'carnet-apercu')}
                  onCategory={pickCategory}
                  onMap={() => go('map')}
                  onOpenEntry={(e) => openCarnetDetail(e)}
                  onConcierge={enterConcierge}
                />
                <StatsBand t={t} entries={photos.length} cities={cityGroups.length} partners={partners.length} />
                <CarnetShowcase t={t} photos={photos} onOpen={(e) => openCarnetDetail(e)} onSeeAll={() => go('carnet')} />
                <ServicesSection t={t} onBlockTech={() => go('blocktech')} />
                <MapSection t={t} photos={photos} onOpen={(e) => openCarnetDetail(e)} onExpand={() => go('map')} />
                <PartnersStrip t={t} partners={partners} onOpen={(p) => openBrand(p.name, p)} onSeeAll={() => go('partners')} />
                <TeamSection t={t} />
                <ContactSection
                  t={t}
                  category={contactCategory}
                  onCategory={setContactCategory}
                  userEmail={userEmail}
                  onLogin={() => setLoginOpen(true)}
                />
              </>
            )}
            {view === 'map' && <MapPage t={t} photos={photos} onOpen={(e) => openCarnetDetail(e)} onBack={() => go('home', 'carte')} />}
            {view === 'carnet' && <CarnetPage t={t} onOpen={(e) => openCarnetDetail(e)} />}
            {view === 'partners' && <PartnersPage t={t} partners={partners} onOpen={(p) => openBrand(p.name, p)} />}
            {view === 'blocktech' && <BlockTechPage t={t} />}
            {view === 'admin-login' && (
              <AdminLogin t={t} onSuccess={() => go('admin')} onForgot={() => { setResetExpired(false); setResetMode('request'); }} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <SiteFooter t={t} onNavigate={go} onConcierge={() => enterConcierge()} />

      <AnimatePresence>
        {view !== 'home' && (
          <motion.button
            className="s-fab"
            aria-label={t.ctaCallback}
            onClick={() => setCallbackOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
          >
            <Phone size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {carnetDetail && (
          <EntrySheet
            key={`entry-${carnetDetail.id}`}
            t={t}
            entry={carnetDetail}
            userEmail={userEmail}
            brandReturn={brandReturn}
            showConciergeReturn={Boolean(conciergeReturn)}
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
            showConciergeReturn={Boolean(conciergeReturn)}
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
        <ConciergePage
          key="concierge"
          overlay
          onClose={() => { setConciergeOpen(false); setConciergeLive(false); }}
          onLiveChange={setConciergeLive}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {portal && (
        <ConciergeTransition
          origin={portal}
          label={t.robotEntering}
          cancelLabel={t.robotCancel}
          onDone={() => { setConciergeOpen(true); setPortal(null); }}
          onCancel={() => setPortal(null)}
        />
      )}
    </AnimatePresence>
    </>
  );
}

export default App;
