import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Settings,
  Users,
  BarChart3,
  PhoneCall,
  Layout,
  Zap,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Cpu,
  FileText,
  Menu,
  X,
  ChevronRight,
  Star,
  TrendingUp,
  Activity,
  Sparkles,
  Layers,
  Target,
  Briefcase,
  UserCheck,
  Award,
  Play,
  ExternalLink,
  LineChart,
  PieChart,
  ChevronLeft,
  ChevronDown,
  Search,
  Bell,
  Home,
  Database,
  MessageSquare,
  HelpCircle
} from "lucide-react";
import { LoginPage } from "./login-page";

export function LandingPage() {
  const [showLogin, setShowLogin] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    {
      title: "Campaign Management",
      desc: "Create and manage recruitment campaigns with automated workflows and multi-channel outreach.",
      icon: <Settings size={22} />,
      color: "var(--blue)"
    },
    {
      title: "Candidate Tracking",
      desc: "Track every candidate through your pipeline with real-time status updates and automated follow-ups.",
      icon: <Users size={22} />,
      color: "var(--cyan)"
    },
    {
      title: "Analytics Dashboard",
      desc: "Gain insights with comprehensive analytics on hiring metrics and campaign performance.",
      icon: <BarChart3 size={22} />,
      color: "var(--emerald)"
    },
    {
      title: "AI Call Analysis",
      desc: "Analyse every candidate call with AI. Get transcripts and hiring recommendations automatically.",
      icon: <PhoneCall size={22} />,
      color: "var(--amber)"
    },
    {
      title: "Kanban Pipeline",
      desc: "Visual drag-and-drop pipeline board with strict forward-only flow enforcement.",
      icon: <Layout size={22} />,
      color: "var(--red)"
    },
    {
      title: "Automation Workflows",
      desc: "Build custom automation for screening and engagement via n8n integration.",
      icon: <Zap size={22} />,
      color: "var(--sky)"
    }
  ];

  const pipelineStages = [
    { label: "Applied", count: "1,284", color: "var(--blue)", pct: 100 },
    { label: "Screening", count: "892", color: "var(--cyan)", pct: 69 },
    { label: "Interview", count: "445", color: "var(--emerald)", pct: 35 },
    { label: "Offer", count: "126", color: "var(--amber)", pct: 10 },
    { label: "Hired", count: "89", color: "var(--red)", pct: 7 }
  ];

  const pricingPlans = [
    {
      name: "Starter",
      price: "Free",
      desc: "Perfect for small teams getting started",
      features: ["Up to 3 campaigns", "50 candidates per month", "Basic analytics", "Email support"],
      cta: "Get Started",
      popular: false
    },
    {
      name: "Professional",
      price: "$49",
      desc: "For growing recruitment teams",
      features: ["Unlimited campaigns", "500 candidates per month", "Advanced analytics", "AI call analysis", "Priority support"],
      cta: "Start Free Trial",
      popular: true
    },
    {
      name: "Enterprise",
      price: "$99",
      desc: "For large-scale hiring operations",
      features: ["Unlimited everything", "Custom integrations", "Dedicated account manager", "SLA guarantee", "API access", "White-labeling"],
      cta: "Contact Sales",
      popular: false
    }
  ];

  return (
    <div className="landing-wrapper" style={{
      background: 'var(--bg)',
      color: 'var(--text)',
      minHeight: '100vh',
      width: '100%',
      fontFamily: 'var(--font)',
      overflowX: 'hidden'
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .landing-glass {
          background: var(--surface);
          backdrop-filter: blur(40px) saturate(1.8);
          -webkit-backdrop-filter: blur(40px) saturate(1.8);
          border: 1px solid var(--glass-edge);
          box-shadow: var(--glass-shadow);
        }
        .landing-card-glass {
          background: var(--surface2);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--glass-edge);
          transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .landing-card-glass:hover {
          background: var(--surface);
          transform: translateY(-4px);
          box-shadow: var(--glass-shadow-hover);
        }
        .hero-title-gradient {
          background: linear-gradient(135deg, var(--text) 30%, var(--blue) 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .btn-ios-primary {
          background: var(--blue);
          color: white;
          padding: 10px 24px;
          border-radius: 999px;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 15px rgba(37,99,235,0.25);
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .btn-ios-primary:hover {
          transform: scale(1.02);
          background: var(--blue-dark);
          box-shadow: 0 8px 25px rgba(37,99,235,0.35);
        }
        .btn-ios-secondary {
          background: transparent;
          color: var(--text);
          padding: 10px 24px;
          border-radius: 999px;
          font-weight: 600;
          font-size: 14px;
          border: 1px solid var(--glass-edge);
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .btn-ios-secondary:hover {
          background: var(--surface2);
          border-color: var(--text3);
        }
        .feature-card {
          background: var(--surface-solid);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          padding: 28px;
          transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .feature-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.08);
          border-color: var(--blue-glass);
        }
        .nav-link {
          position: relative;
          font-size: 13px;
          font-weight: 500;
          color: var(--text2);
          transition: color 0.2s ease;
          cursor: pointer;
        }
        .nav-link:hover {
          color: var(--text);
        }
        .pricing-card {
          background: var(--surface-solid);
          border: 1px solid var(--border-color);
          border-radius: 24px;
          padding: 32px;
          transition: all 0.3s ease;
        }
        .pricing-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.08);
        }
        .pricing-card.popular {
          border-color: var(--blue);
          box-shadow: 0 8px 40px rgba(37,99,235,0.12);
          position: relative;
        }
        .popular-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--blue);
          color: white;
          padding: 4px 16px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .dashboard-window {
          background: var(--surface-solid);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          overflow: hidden;
          box-shadow:
            0 4px 24px rgba(0,0,0,0.06),
            0 20px 60px rgba(0,0,0,0.08);
        }
        .dashboard-window.dark {
          background: #1e2433;
          border-color: #2a3040;
        }
        .float-card {
          background: var(--surface);
          backdrop-filter: blur(24px) saturate(1.6);
          -webkit-backdrop-filter: blur(24px) saturate(1.6);
          border: 1px solid var(--glass-edge);
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
          padding: 20px;
        }
        @media (prefers-color-scheme: dark) {
          .dashboard-window {
            background: #1e2433;
            border-color: #2a3040;
          }
        }
        body[data-theme="dark"] .dashboard-window {
          background: #1e2433;
          border-color: #2a3040;
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float 6s ease-in-out 2s infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .stage-connector {
          flex: 1;
          height: 2px;
          background: var(--border-color);
          position: relative;
        }
        .stage-connector.active {
          background: var(--blue);
        }
        .stage-connector.active::after {
          content: '';
          position: absolute;
          right: -3px;
          top: 50%;
          transform: translateY(-50%);
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--blue);
        }
        .bg-grid {
          background-image:
            linear-gradient(var(--border-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-color) 1px, transparent 1px);
          background-size: 60px 60px;
        }
      `}} />

      {/* ─── Animated Background ─── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[150px]" style={{ background: 'var(--blue)', opacity: 0.06 }}></div>
        <div className="absolute bottom-[5%] right-[-5%] w-[500px] h-[500px] rounded-full blur-[140px]" style={{ background: 'var(--cyan)', opacity: 0.05 }}></div>
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full blur-[100px]" style={{ background: 'var(--emerald)', opacity: 0.03 }}></div>
      </div>

      {/* ─── NAVBAR ─── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'landing-glass shadow-sm' : 'bg-transparent'}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          transition: 'all 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
          ...(scrolled ? {} : { backdropFilter: 'none', borderBottom: '1px solid transparent' })
        }}
      >
        <div className="w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12">
          <div className="flex items-center justify-between h-16 md:h-18">
            <div className="flex items-center gap-10 2xl:gap-14">
              <a href="#" className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 2xl:w-8 2xl:h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--blue)' }}>
                  <Zap size={14} className="text-white" fill="white" />
                </div>
                <span className="text-base 2xl:text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>ScalePods</span>
              </a>
              <div className="hidden md:flex items-center gap-8 2xl:gap-10">
                {['Features', 'Benefits', 'Pipeline', 'Pricing', 'Contact'].map((item) => (
                  <a key={item} href={`#${item.toLowerCase()}`}
                    className="nav-link 2xl:text-[14px]"
                  >
                    {item}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 2xl:gap-4">
              <button
                onClick={() => setShowLogin(true)}
                className="hidden sm:inline-flex text-[13px] 2xl:text-[14px] font-semibold px-4 2xl:px-5 py-2 rounded-full transition-all"
                style={{ color: 'var(--text2)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text2)'}
              >
                Sign In
              </button>
              <button
                onClick={() => setShowLogin(true)}
                className="btn-ios-primary text-[13px] 2xl:text-[14px] px-5 2xl:px-6 py-2"
              >
                Get Started
                <ArrowRight size={14} />
              </button>
              <button className="md:hidden p-2" style={{ color: 'var(--text2)' }} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>
        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden overflow-hidden border-t" style={{ borderColor: 'var(--border-color)', background: 'var(--surface-solid)' }}
            >
              <div className="px-6 py-4 flex flex-col gap-3">
                {['Features', 'Benefits', 'Pipeline', 'Pricing', 'Contact'].map((item) => (
                  <a key={item} href={`#${item.toLowerCase()}`}
                    className="text-sm font-semibold py-2" style={{ color: 'var(--text2)' }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item}
                  </a>
                ))}
                <button
                  onClick={() => { setShowLogin(true); setMobileMenuOpen(false); }}
                  className="btn-ios-primary text-[13px] justify-center mt-2"
                >
                  Sign In
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── HERO SECTION ─── */}
      <section className="relative z-10 pt-28 pb-16 md:pt-36 md:pb-20 2xl:pt-40 2xl:pb-24 px-6 md:px-8 2xl:px-12 w-full max-w-[1600px] mx-auto"
        style={{ position: 'relative', zIndex: 10, paddingTop: '160px', paddingBottom: '80px', paddingLeft: '32px', paddingRight: '32px', width: '100%', maxWidth: '1600px', marginLeft: 'auto', marginRight: 'auto' }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 2xl:gap-20 items-center"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: '64px', alignItems: 'center' }}
        >
          {/* Left Column */}
          <div className="lg:col-span-6 2xl:col-span-5" style={{ gridColumn: 'span 6' }}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 px-3 2xl:px-4 py-1.5 rounded-full text-[11px] 2xl:text-[12px] font-bold uppercase tracking-widest mb-6 2xl:mb-8"
                style={{ background: 'var(--blue-glass)', color: 'var(--blue)', border: '1px solid var(--blue-glass)' }}
              >
                <Sparkles size={12} /> AI-Powered Talent OS
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="hero-title-gradient text-[40px] leading-[1.08] md:text-[68px] lg:text-[76px] 2xl:text-[88px] font-black tracking-[-0.04em] mb-5 2xl:mb-6"
            >
              Hire Smarter with<br />ScalePods Intel
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-[17px] md:text-[19px] 2xl:text-[21px] leading-relaxed max-w-[520px] 2xl:max-w-[580px] mb-8 2xl:mb-10"
              style={{ color: 'var(--text2)' }}
            >
              The minimal, all-in-one recruitment platform with AI screening, automated pipelines, and intelligent offer management.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-3 2xl:gap-4 mb-10 2xl:mb-12"
            >
              <button onClick={() => setShowLogin(true)} className="btn-ios-primary px-6 2xl:px-8 py-3 2xl:py-3.5 text-[14px] 2xl:text-[15px]">
                Go to Dashboard
                <ArrowRight size={16} />
              </button>
              <button className="btn-ios-secondary px-6 2xl:px-8 py-3 2xl:py-3.5 text-[14px] 2xl:text-[15px]">
                <Play size={14} /> Watch Demo
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex items-center gap-4 2xl:gap-5"
            >
              <div className="flex -space-x-2 2xl:-space-x-3">
                {['#2563eb', '#06b6d4', '#10b981', '#f59e0b'].map((bg, i) => (
                  <div key={i} className="w-8 h-8 2xl:w-10 2xl:h-10 rounded-full border-2 border-white flex items-center justify-center text-[10px] 2xl:text-[11px] font-bold text-white"
                    style={{ background: bg, borderColor: 'var(--bg)' }}
                  >
                    {['JP', 'AK', 'RS', 'MT'][i]}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-sm 2xl:text-base font-semibold" style={{ color: 'var(--text)' }}>Trusted by growing teams</div>
                <div className="text-xs 2xl:text-sm" style={{ color: 'var(--text3)' }}>Join 500+ companies</div>
              </div>
            </motion.div>
          </div>

          {/* Right Column - Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="lg:col-span-6 2xl:col-span-7 relative"
            style={{ gridColumn: 'span 6', position: 'relative' }}
          >
            <div className="relative">
              {/* Main Dashboard Window */}
              <div className="dashboard-window shadow-2xl">
                {/* Window chrome */}
                <div className="h-9 2xl:h-10 flex items-center px-4 2xl:px-5 gap-1.5 2xl:gap-2 border-b" style={{ background: 'var(--surface2)', borderColor: 'var(--border-color)' }}>
                  <div className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 rounded-full" style={{ background: '#ef4444' }}></div>
                  <div className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 rounded-full" style={{ background: '#f59e0b' }}></div>
                  <div className="w-2.5 h-2.5 2xl:w-3 2xl:h-3 rounded-full" style={{ background: '#10b981' }}></div>
                  <div className="ml-4 flex-1 max-w-[200px] 2xl:max-w-[260px] h-5 2xl:h-6 rounded-md flex items-center justify-center text-[10px] 2xl:text-[11px] font-medium" style={{ background: 'var(--surface3)', color: 'var(--text3)' }}>
                    app.scalepods.co/dashboard
                  </div>
                </div>

                {/* Dashboard Content */}
                <div className="flex" style={{ minHeight: '320px' }}>
                  {/* Mini Sidebar */}
                  <div className="w-14 2xl:w-16 flex flex-col items-center py-4 2xl:py-5 gap-4 2xl:gap-5 border-r shrink-0" style={{ background: 'var(--surface2)', borderColor: 'var(--border-color)' }}>
                    {[Home, Search, BarChart3, Users, Settings].map((Icon, i) => (
                      <div key={i} className="w-8 h-8 2xl:w-9 2xl:h-9 rounded-lg flex items-center justify-center transition-colors"
                        style={{ background: i === 0 ? 'var(--blue-glass)' : 'transparent', color: i === 0 ? 'var(--blue)' : 'var(--text3)' }}
                      >
                        <Icon size={15} />
                      </div>
                    ))}
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 p-5 2xl:p-6 space-y-4 2xl:space-y-5" style={{ background: 'var(--surface-solid)' }}>
                    {/* Top bar */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] 2xl:text-[12px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Overview</div>
                        <div className="text-sm 2xl:text-base font-bold" style={{ color: 'var(--text)' }}>Dashboard</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 2xl:w-7 2xl:h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--surface3)' }}>
                          <Bell size={12} style={{ color: 'var(--text3)' }} />
                        </div>
                        <div className="w-6 h-6 2xl:w-7 2xl:h-7 rounded-full flex items-center justify-center text-[9px] 2xl:text-[10px] font-bold text-white" style={{ background: 'var(--blue)' }}>
                          SP
                        </div>
                      </div>
                    </div>

                    {/* KPI Row */}
                    <div className="grid grid-cols-3 gap-3 2xl:gap-4">
                      {[
                        { label: 'Active', value: '1,284', bg: 'var(--blue-glass)', color: 'var(--blue)' },
                        { label: 'Avg Score', value: '94', bg: 'var(--emerald-glass)', color: 'var(--emerald)' },
                        { label: 'Hired', value: '89', bg: 'var(--cyan-glass)', color: 'var(--cyan)' }
                      ].map((kpi, i) => (
                        <div key={i} className="rounded-xl 2xl:rounded-2xl p-3 2xl:p-4" style={{ background: kpi.bg }}>
                          <div className="text-[18px] 2xl:text-[22px] font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                          <div className="text-[10px] 2xl:text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text3)' }}>{kpi.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Pipeline Bar */}
                    <div>
                      <div className="text-[10px] 2xl:text-[11px] font-semibold uppercase tracking-wider mb-2 2xl:mb-3" style={{ color: 'var(--text3)' }}>Pipeline Flow</div>
                      <div className="flex items-center gap-2 2xl:gap-3">
                        {pipelineStages.slice(0, 4).map((stage, i) => (
                          <div key={i} className="flex items-center gap-2 flex-1">
                            <div className="flex-1 h-7 2xl:h-8 rounded-md flex items-center justify-center text-[9px] 2xl:text-[10px] font-bold"
                              style={{ background: stage.color + '18', color: stage.color }}
                            >
                              {stage.label}
                            </div>
                            {i < 3 && (
                              <ChevronRight size={12} style={{ color: 'var(--text3)' }} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Chart */}
                    <div className="rounded-xl 2xl:rounded-2xl p-4 2xl:p-5" style={{ background: 'var(--surface2)' }}>
                      <div className="text-[10px] 2xl:text-[11px] font-semibold uppercase tracking-wider mb-3 2xl:mb-4" style={{ color: 'var(--text3)' }}>Candidate Growth</div>
                      <div className="flex items-end gap-1.5 2xl:gap-2 h-20 2xl:h-24">
                        {[35, 45, 42, 58, 62, 55, 70, 78, 65, 82, 90, 85].map((h, i) => (
                          <div key={i} className="flex-1 rounded-t-sm 2xl:rounded-t transition-all duration-300"
                            style={{
                              height: h + '%',
                              background: i > 8 ? 'var(--blue)' : 'var(--blue-glass)',
                              opacity: i > 8 ? 1 : 0.6
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Bottom activity */}
                    <div className="flex items-center gap-2 text-[10px] 2xl:text-[11px]" style={{ color: 'var(--text3)' }}>
                      <div className="w-1.5 h-1.5 2xl:w-2 2xl:h-2 rounded-full" style={{ background: 'var(--emerald)' }}></div>
                      <span>AI analysis active — <strong style={{ color: 'var(--text2)' }}>12 new candidates</strong> today</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Card 1 - Pipeline Stats */}
              <div className="absolute -top-4 -right-4 2xl:-top-5 2xl:-right-5 float-card animate-float hidden md:block"
                style={{ width: '170px' }}
              >
                <div className="text-[10px] 2xl:text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Pipeline Health</div>
                <div className="text-2xl 2xl:text-3xl font-black" style={{ color: 'var(--blue)' }}>892</div>
                <div className="text-[11px] 2xl:text-[12px] font-medium mb-2" style={{ color: 'var(--text2)' }}>active candidates</div>
                <div className="flex gap-1">
                  {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                    <div key={i} className="flex-1 h-1 2xl:h-1.5 rounded-full" style={{ background: h > 60 ? 'var(--emerald)' : 'var(--emerald-glass)' }}></div>
                  ))}
                </div>
              </div>

              {/* Floating Card 2 - AI Score */}
              <div className="absolute -bottom-3 -left-3 2xl:-bottom-4 2xl:-left-4 float-card animate-float-delayed hidden md:block"
                style={{ width: '150px' }}
              >
                <div className="flex items-center gap-3 2xl:gap-4">
                  <div className="w-10 h-10 2xl:w-12 2xl:h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--emerald-glass)' }}>
                    <Award size={18} style={{ color: 'var(--emerald)' }} />
                  </div>
                  <div>
                    <div className="text-[10px] 2xl:text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>AI Score</div>
                    <div className="flex items-center gap-1">
                      <span className="text-lg 2xl:text-xl font-black" style={{ color: 'var(--emerald)' }}>94%</span>
                      <span className="text-[10px] 2xl:text-[11px]" style={{ color: 'var(--text3)' }}>↑ 12%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Card 3 - Quick Stats */}
              <div className="absolute top-1/2 -right-6 2xl:-right-7 -translate-y-1/2 float-card animate-float hidden xl:block"
                style={{ width: '130px' }}
              >
                <div className="text-[10px] 2xl:text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text3)' }}>Time to Hire</div>
                <div className="text-lg 2xl:text-xl font-black" style={{ color: 'var(--cyan)' }}>8.2d</div>
                <div className="text-[10px] 2xl:text-[11px]" style={{ color: 'var(--emerald)' }}>↓ 35% vs last month</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── SOCIAL PROOF BANNER ─── */}
      <section className="relative z-10 w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12 pb-12 md:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center py-8 rounded-2xl" style={{ background: 'var(--surface2)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-widest mb-5" style={{ color: 'var(--text3)' }}>Trusted by innovative teams worldwide</div>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 px-6">
            {['Linear', 'Stripe', 'Vercel', 'Notion', 'Rippling'].map((name) => (
              <div key={name} className="text-sm font-bold tracking-tight opacity-40" style={{ color: 'var(--text)' }}>
                {name}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ─── FEATURES SECTION ─── */}
      <section id="features" className="relative z-10 py-16 md:py-20 2xl:py-24 w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] 2xl:text-[11px] font-bold uppercase tracking-widest mb-4"
            style={{ background: 'var(--blue-glass)', color: 'var(--blue)' }}
          >
            <Layers size={11} /> Platform Features
          </span>
          <h2 className="text-[32px] md:text-[44px] 2xl:text-[50px] font-black tracking-[-0.03em] mb-4" style={{ color: 'var(--text)' }}>
            Total Control of Your Pipeline
          </h2>
          <p className="text-[16px] md:text-[17px] 2xl:text-[19px] max-w-[580px] 2xl:max-w-[650px] mx-auto" style={{ color: 'var(--text2)' }}>
            Everything you need to scale your team, condensed into a single elegant interface.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px' }}
        >
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="feature-card group"
            >
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5 transition-all group-hover:scale-110 group-hover:shadow-md"
                style={{ background: feature.color + '14', color: feature.color }}
              >
                {feature.icon}
              </div>
              <h3 className="text-[18px] font-bold mb-2.5 tracking-tight" style={{ color: 'var(--text)' }}>{feature.title}</h3>
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text2)' }}>
                {feature.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── BENEFITS / PIPELINE SECTION ─── */}
      <section id="benefits" className="relative z-10 py-16 md:py-20 2xl:py-24 w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 2xl:gap-20 items-center"
        >
          <div>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] 2xl:text-[11px] font-bold uppercase tracking-widest mb-4"
              style={{ background: 'var(--emerald-glass)', color: 'var(--emerald)' }}
            >
              <TrendingUp size={11} /> Efficiency Boost
            </span>
            <h2 className="text-[32px] md:text-[40px] 2xl:text-[46px] font-black tracking-[-0.03em] mb-4 leading-[1.1]" style={{ color: 'var(--text)' }}>
              Built for High-Growth HR Teams
            </h2>
            <p className="text-[15px] md:text-[16px] 2xl:text-[18px] leading-relaxed mb-8 2xl:mb-10" style={{ color: 'var(--text2)' }}>
              From resume screening to offer letter, ScalePods automates the entire recruitment workflow so your team can focus on what matters — hiring the best talent.
            </p>

            <div className="space-y-4 mb-8">
              {[
                { text: "Reduce time-to-hire by 85% with automation", icon: <Clock size={16} />, color: 'var(--blue)' },
                { text: "Centralized candidate communication & docs", icon: <FileText size={16} />, color: 'var(--cyan)' },
                { text: "AI-driven sentiment analysis for all calls", icon: <PhoneCall size={16} />, color: 'var(--emerald)' },
                { text: "Drag-and-drop Kanban round management", icon: <Layout size={16} />, color: 'var(--amber)' }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: item.color + '14', color: item.color }}
                  >
                    {item.icon}
                  </div>
                  <span className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{item.text}</span>
                </div>
              ))}
            </div>

            <button onClick={() => setShowLogin(true)} className="btn-ios-primary text-[13px]">
              Start Building Your Pipeline
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="relative">
            {/* Pipeline Visualization */}
            <div className="dashboard-window shadow-xl">
              <div className="h-8 flex items-center px-4 gap-1.5 border-b" style={{ background: 'var(--surface2)', borderColor: 'var(--border-color)' }}>
                <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }}></div>
                <div className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }}></div>
                <div className="w-2 h-2 rounded-full" style={{ background: '#10b981' }}></div>
                <div className="ml-3 text-[9px] font-medium" style={{ color: 'var(--text3)' }}>pipeline</div>
              </div>
              <div className="p-5" style={{ background: 'var(--surface-solid)' }}>
                <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text3)' }}>Candidate Pipeline</div>

                {/* Pipeline stages with bars */}
                <div className="space-y-4">
                  {pipelineStages.map((stage, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-semibold" style={{ color: 'var(--text)' }}>{stage.label}</span>
                        <span className="font-bold" style={{ color: stage.color }}>{stage.count}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface3)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: stage.pct + '%',
                            background: `linear-gradient(90deg, ${stage.color}, ${stage.color}88)`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Conversion arrows */}
                <div className="flex items-center justify-between mt-5 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
                  {['Applied', '', 'Screening', '', 'Interview', '', 'Offer', '', 'Hired'].map((label, i) => (
                    label ? (
                      <div key={i} className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                        style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                      >
                        {label}
                      </div>
                    ) : (
                      <ChevronRight key={i} size={14} style={{ color: 'var(--text3)' }} />
                    )
                  ))}
                </div>
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-3 -right-3 float-card animate-float hidden md:block">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--blue-glass)' }}>
                  <Target size={18} style={{ color: 'var(--blue)' }} />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Conversion</div>
                  <div className="text-lg font-black" style={{ color: 'var(--blue)' }}>72%</div>
                  <div className="text-[10px]" style={{ color: 'var(--emerald)' }}>↑ 18% improvement</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── PIPELINE DETAIL SECTION ─── */}
      <section id="pipeline" className="relative z-10 py-16 md:py-20 2xl:py-24 w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="landing-glass rounded-[32px] md:rounded-[48px] p-8 md:p-14 overflow-hidden relative"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 2xl:gap-20 items-center">
            <div className="z-10">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] 2xl:text-[11px] font-bold uppercase tracking-widest mb-4"
                style={{ background: 'var(--blue-glass)', color: 'var(--blue)' }}
              >
                <Activity size={11} /> Pipeline Overview
              </span>
              <h2 className="text-[28px] md:text-[36px] 2xl:text-[42px] font-black tracking-[-0.03em] mb-4 leading-[1.1]" style={{ color: 'var(--text)' }}>
                From Application to Offer in One Flow
              </h2>
              <p className="text-[15px] 2xl:text-[17px] leading-relaxed mb-6" style={{ color: 'var(--text2)' }}>
                Visualize every stage of your hiring pipeline. Track candidates as they move through screening, interviews, and final decisions — all in one place.
              </p>

              <div className="flex flex-wrap gap-3">
                {[
                  { label: 'Applied', color: 'var(--blue)' },
                  { label: 'Screening', color: 'var(--cyan)' },
                  { label: 'Interview', color: 'var(--emerald)' },
                  { label: 'Offer', color: 'var(--amber)' },
                  { label: 'Hired', color: 'var(--red)' }
                ].map((stage, i) => (
                  <div key={i} className="px-3 py-1.5 rounded-full text-[11px] font-bold"
                    style={{ background: stage.color + '14', color: stage.color }}
                  >
                    {stage.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="z-10">
              <div className="space-y-4">
                {[
                  { title: 'AI Resume Screening', desc: 'Automatically parse and score resumes against your job descriptions with AI.', icon: <Cpu size={18} />, color: 'var(--blue)' },
                  { title: 'Smart Round Matching', desc: 'Intelligently route candidates to the right interview round based on their profile.', icon: <UserCheck size={18} />, color: 'var(--cyan)' },
                  { title: 'Automated Offer Management', desc: 'Generate offer letters, track acceptances, and manage onboarding in one click.', icon: <Award size={18} />, color: 'var(--emerald)' }
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-2xl transition-all"
                    style={{ background: 'var(--surface2)' }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: item.color + '14', color: item.color }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-[14px] font-bold mb-1" style={{ color: 'var(--text)' }}>{item.title}</div>
                      <div className="text-[13px] leading-relaxed" style={{ color: 'var(--text2)' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ─── PRICING SECTION ─── */}
      <section id="pricing" className="relative z-10 py-16 md:py-20 2xl:py-24 w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
            style={{ background: 'var(--blue-glass)', color: 'var(--blue)' }}
          >
            <Sparkles size={11} /> Simple Pricing
          </span>
          <h2 className="text-[32px] md:text-[40px] 2xl:text-[46px] font-black tracking-[-0.03em] mb-3" style={{ color: 'var(--text)' }}>
            Scale as You Grow
          </h2>
          <p className="text-[15px] md:text-[16px] 2xl:text-[18px] max-w-[500px] 2xl:max-w-[560px] mx-auto" style={{ color: 'var(--text2)' }}>
            Start free, upgrade when you need more. No hidden fees.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 2xl:gap-6 max-w-[1100px] 2xl:max-w-[1200px] mx-auto"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '20px', maxWidth: '1100px', marginLeft: 'auto', marginRight: 'auto' }}
        >
          {pricingPlans.map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`pricing-card ${plan.popular ? 'popular' : ''}`}
            >
              {plan.popular && <div className="popular-badge">Most Popular</div>}
              <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text3)' }}>{plan.name}</div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-[36px] font-black tracking-[-0.03em]" style={{ color: 'var(--text)' }}>{plan.price}</span>
                {plan.price !== 'Free' && <span className="text-[13px] font-medium" style={{ color: 'var(--text3)' }}>/mo</span>}
              </div>
              <div className="text-[13px] mb-6" style={{ color: 'var(--text2)' }}>{plan.desc}</div>
              <ul className="space-y-2.5 mb-8">
                {plan.features.map((feat, j) => (
                  <li key={j} className="flex items-center gap-2.5 text-[13px]">
                    <CheckCircle2 size={14} style={{ color: 'var(--emerald)' }} />
                    <span style={{ color: 'var(--text2)' }}>{feat}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setShowLogin(true)}
                className={`w-full py-2.5 rounded-full text-[13px] font-bold transition-all ${plan.popular ? 'btn-ios-primary justify-center' : 'btn-ios-secondary justify-center'}`}
              >
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── CONTACT SECTION ─── */}
      <section id="contact" className="relative z-10 py-16 md:py-20 2xl:py-24 w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="landing-glass rounded-[32px] md:rounded-[48px] p-10 md:p-16 text-center relative overflow-hidden"
        >
          <div className="relative z-10 max-w-[600px] mx-auto">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
              style={{ background: 'var(--blue-glass)', color: 'var(--blue)' }}
            >
              <MessageSquare size={11} /> Get in Touch
            </span>
            <h2 className="text-[28px] md:text-[36px] 2xl:text-[42px] font-black tracking-[-0.03em] mb-4" style={{ color: 'var(--text)' }}>
              Ready to Scale Your Hiring?
            </h2>
            <p className="text-[15px] md:text-[16px] 2xl:text-[18px] mb-8 max-w-[440px] 2xl:max-w-[500px] mx-auto" style={{ color: 'var(--text2)' }}>
              Join 500+ teams hiring with intelligence. Get started for free or reach out for a personalized demo.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={() => setShowLogin(true)} className="btn-ios-primary px-8 py-3 text-[14px]">
                Start for Free
                <ArrowRight size={16} />
              </button>
              <a href="mailto:hello@scalepods.co" className="btn-ios-secondary px-8 py-3 text-[14px]">
                Contact Sales
              </a>
            </div>
          </div>
          <div className="absolute -bottom-10 -right-10 w-60 h-60 rounded-full blur-[100px]" style={{ background: 'var(--blue)', opacity: 0.06 }}></div>
          <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full blur-[80px]" style={{ background: 'var(--cyan)', opacity: 0.05 }}></div>
        </motion.div>
      </section>

      {/* ─── CTA SECTION ─── */}
      <section className="relative z-10 py-12 md:py-16 2xl:py-20 w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="text-[28px] md:text-[36px] 2xl:text-[42px] font-black tracking-[-0.03em] mb-3" style={{ color: 'var(--text)' }}>
            Ready to Scale?
          </h2>
          <p className="text-[15px] md:text-[16px] 2xl:text-[18px] mb-6 2xl:mb-8" style={{ color: 'var(--text3)' }}>
            Join 500+ teams hiring with intelligence.
          </p>
          <button
            onClick={() => setShowLogin(true)}
            className="btn-ios-primary px-8 py-3 text-[14px]"
          >
            Start for Free
            <ArrowRight size={16} />
          </button>
        </motion.div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="relative z-10 py-10 border-t w-full max-w-[1600px] mx-auto px-6 md:px-8 2xl:px-12"
        style={{ borderColor: 'var(--separator)' }}
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <a href="#" className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--blue)' }}>
                <Zap size={11} className="text-white" fill="white" />
              </div>
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>ScalePods</span>
            </a>
            <span className="text-[10px] font-bold uppercase tracking-widest ml-2" style={{ color: 'var(--text3)' }}>
              © 2026 ScalePods OS
            </span>
          </div>
          <div className="flex gap-6 text-[11px] font-semibold">
            <a href="#" className="transition-colors" style={{ color: 'var(--text3)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
            >Terms</a>
            <a href="#" className="transition-colors" style={{ color: 'var(--text3)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
            >Privacy</a>
            <a href="#" className="transition-colors" style={{ color: 'var(--text3)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
            >Contact</a>
          </div>
        </div>
      </footer>

      {/* ─── Login Dialog ─── (unchanged) */}
      <AnimatePresence>
        {showLogin && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogin(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-[480px] bg-[var(--surface-solid)] p-2 rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="absolute top-6 right-6 z-10">
                <button
                  onClick={() => setShowLogin(false)}
                  className="w-10 h-10 rounded-full bg-[var(--surface2)] flex items-center justify-center text-[var(--text2)] hover:text-[var(--text)] transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4">
                <LoginPage isModal />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
