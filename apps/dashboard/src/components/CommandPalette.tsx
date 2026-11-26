import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  BriefcaseBusiness,
  Building2,
  Code2,
  Compass,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Moon,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  Terminal,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

interface CommandItem {
  id: string;
  label: string;
  section: string;
  keywords: string;
  icon: ReactNode;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSignOut?: () => void;
}

export default function CommandPalette({ open, onClose, onSignOut }: Props) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<CommandItem[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };
    const base: CommandItem[] = [
      { id: 'overview', label: 'Overview', section: 'Workspace', keywords: 'home dashboard stats', icon: <LayoutDashboard size={15} />, run: go('/overview') },
      { id: 'discover', label: 'Discover jobs', section: 'Workspace', keywords: 'search listings match', icon: <Compass size={15} />, run: go('/discover') },
      { id: 'resumes', label: 'Resume Studio', section: 'Workspace', keywords: 'cv pdf docx extract', icon: <FileText size={15} />, run: go('/resumes') },
      { id: 'companies', label: 'Companies', section: 'Intelligence', keywords: 'employers research', icon: <Building2 size={15} />, run: go('/companies') },
      { id: 'contacts', label: 'People & contacts', section: 'Intelligence', keywords: 'recruiters hiring managers', icon: <Users size={15} />, run: go('/contacts') },
      { id: 'applications', label: 'Applications pipeline', section: 'Pipeline', keywords: 'tracker applied status', icon: <BriefcaseBusiness size={15} />, run: go('/applications') },
      { id: 'outreach', label: 'Outreach drafts', section: 'Pipeline', keywords: 'email cover letter messages', icon: <Mail size={15} />, run: go('/outreach') },
      { id: 'research', label: 'Research activity', section: 'Automation', keywords: 'overnight queue logs', icon: <Terminal size={15} />, run: go('/research') },
      { id: 'prof-personal', label: 'Profile · Personal details', section: 'Profile', keywords: 'name phone links', icon: <UserRound size={15} />, run: go('/profile/personal') },
      { id: 'prof-education', label: 'Profile · Education', section: 'Profile', keywords: 'degree university college', icon: <GraduationCap size={15} />, run: go('/profile/education') },
      { id: 'prof-projects', label: 'Profile · Projects', section: 'Profile', keywords: 'portfolio github repos', icon: <Code2 size={15} />, run: go('/profile/projects') },
      { id: 'prof-skills', label: 'Profile · Skills', section: 'Profile', keywords: 'stack languages frameworks', icon: <Wrench size={15} />, run: go('/profile/skills') },
      { id: 'prof-prefs', label: 'Profile · Job preferences', section: 'Profile', keywords: 'salary remote roles locations', icon: <SlidersHorizontal size={15} />, run: go('/profile/preferences') },
      { id: 'settings', label: 'Settings & Local Runtime', section: 'System', keywords: 'theme ollama firecrawl', icon: <Settings size={15} />, run: go('/settings') },
      {
        id: 'theme',
        label: theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode',
        section: 'Appearance',
        keywords: 'dark light theme color',
        icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
        run: () => {
          toggleTheme();
          onClose();
        },
      },
    ];

    if (onSignOut) {
      base.push({
        id: 'signout',
        label: 'Sign out',
        section: 'Account',
        keywords: 'logout exit',
        icon: <LogOut size={15} />,
        run: () => {
          onClose();
          onSignOut();
        },
      });
    }
    return base;
  }, [navigate, onClose, onSignOut, theme, toggleTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q)
        || item.section.toLowerCase().includes(q)
        || item.keywords.includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((idx) => (filtered.length ? (idx + 1) % filtered.length : 0));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((idx) => (filtered.length ? (idx - 1 + filtered.length) % filtered.length : 0));
      } else if (event.key === 'Enter' && filtered[selectedIndex]) {
        event.preventDefault();
        filtered[selectedIndex].run();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, selectedIndex, onClose]);

  if (!open) return null;

  return (
    <div className="cs-cmd-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="cs-cmd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="cs-cmd-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Jump to section, edit profile, or toggle theme…"
            aria-label="Search commands"
          />
          <span className="cs-kbd">ESC</span>
        </div>
        <div className="cs-cmd-list">
          {filtered.length === 0 ? (
            <div className="cs-cmd-empty">No matching commands found.</div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`cs-cmd-item${idx === selectedIndex ? ' selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={item.run}
              >
                {item.icon}
                <span>{item.label}</span>
                <small>{item.section}</small>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
