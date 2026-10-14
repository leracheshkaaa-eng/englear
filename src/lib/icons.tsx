import type { LucideIcon, LucideProps } from 'lucide-react'
import {
  Ban,
  BookMarked,
  BookOpen,
  Brain,
  Briefcase,
  ChartColumn,
  Check,
  CircleAlert,
  ClipboardList,
  Clock,
  Coffee,
  Dumbbell,
  Euro,
  Flame,
  Folder,
  GraduationCap,
  Headphones,
  House,
  Keyboard,
  Laugh,
  Layers,
  LayoutGrid,
  Library,
  Lightbulb,
  Link,
  ListChecks,
  Lock,
  LogOut,
  MessageCircle,
  Mic,
  Newspaper,
  NotebookPen,
  Palette,
  PartyPopper,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Pencil,
  Plane,
  Plus,
  Popcorn,
  Presentation,
  Scale,
  Settings,
  Snowflake,
  Sparkles,
  Speech,
  Square,
  Sun,
  Table,
  Target,
  TrendingUp,
  TriangleAlert,
  Upload,
  Users,
  Volume2,
  X,
} from 'lucide-react'

/* ============================================================
   Interface icons. Drawn as SVG (Lucide, MIT licence + our own coin), so they look the
   same on every device — emoji depend on the system font (Windows 10 has no coin emoji, for one).
   Every icon is 1.1em and sits on the text line; colour follows the text (currentColor).
   ============================================================ */

export type Icon = (p: { className?: string; title?: string }) => React.ReactElement

const base = 'inline-block shrink-0 align-[-0.18em]'

function wrap(C: LucideIcon): Icon {
  const Wrapped = ({ className = '', title }: { className?: string; title?: string }) => {
    const props: LucideProps = { size: '1.1em', strokeWidth: 2, className: `${base} ${className}` }
    return title ? <C {...props} aria-label={title} role="img" /> : <C {...props} aria-hidden="true" />
  }
  return Wrapped
}

// navigation
export const IconHome = wrap(House)
export const IconLessons = wrap(Library)
export const IconTasks = wrap(Pencil)
export const IconPractice = wrap(BookOpen)
export const IconBoards = wrap(Presentation)
export const IconCards = wrap(Layers)
export const IconDictionary = wrap(BookMarked)
export const IconProgress = wrap(TrendingUp)
export const IconTeacher = wrap(GraduationCap)
export const IconSettings = wrap(Settings)
export const IconPrice = wrap(Euro)
export const IconSignOut = wrap(LogOut)
export const IconFamily = wrap(Users)

// states and actions
export const IconStreak = wrap(Flame)
export const IconFreeze = wrap(Snowflake)
export const IconLock = wrap(Lock)
export const IconSparkle = wrap(Sparkles)
export const IconTime = wrap(Clock)
export const IconBoardPlan = wrap(ClipboardList)
export const IconDone = wrap(PartyPopper)
export const IconSound = wrap(Volume2)
export const IconNo = wrap(Ban)
export const IconWrong = wrap(X)
export const IconRight = wrap(Check)
export const IconTarget = wrap(Target)
export const IconCompare = wrap(Scale)
export const IconComment = wrap(MessageCircle)
export const IconBrain = wrap(Brain)
export const IconMic = wrap(Mic)
export const IconKeyboard = wrap(Keyboard)
export const IconStrength = wrap(Dumbbell)
export const IconSpeak = wrap(Speech)
export const IconIdea = wrap(Lightbulb)
export const IconSun = wrap(Sun)
export const IconLaugh = wrap(Laugh)
export const IconPoll = wrap(ChartColumn)
export const IconNews = wrap(Newspaper)
export const IconHomework = wrap(NotebookPen)
export const IconLink = wrap(Link)
export const IconWarn = wrap(TriangleAlert)
export const IconAlert = wrap(CircleAlert)
export const IconFolder = wrap(Folder)
export const IconTable = wrap(Table)
export const IconGrid = wrap(LayoutGrid)
export const IconList = wrap(ListChecks)
export const IconUpload = wrap(Upload)
export const IconStop = wrap(Square)
export const IconAudio = wrap(Headphones)
export const IconPlus = wrap(Plus)
export const IconPalette = wrap(Palette)
export const IconPlay = wrap(Play)
export const IconPause = wrap(Pause)
export const IconPrev = wrap(SkipBack)
export const IconNext = wrap(SkipForward)

// speaking scenarios
export const IconChat = wrap(MessageCircle)
export const IconCafe = wrap(Coffee)
export const IconParty = wrap(PartyPopper)
export const IconWork = wrap(Briefcase)
export const IconTravel = wrap(Plane)
export const IconFandom = wrap(Popcorn)

/** Lean's ears — the mark of the AI tutor (instead of a fox emoji). */
export function IconLean({ className = '', title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.1em"
      height="1.1em"
      className={`${base} ${className}`}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <path d="M3.5 20 C3 15 3.6 9.5 5.2 4.5 C8 8 10.2 12.5 11 19 Z" fill="currentColor" />
      <path d="M20.5 20 C21 15 20.4 9.5 18.8 4.5 C16 8 13.8 12.5 13 19 Z" fill="currentColor" />
      <path d="M5.4 18.5 C5.3 15.2 5.7 12 6.5 9.3 C8 11.6 9 14 9.4 17.8 Z" fill="#f3cfc9" />
      <path d="M18.6 18.5 C18.7 15.2 18.3 12 17.5 9.3 C16 11.6 15 14 14.6 17.8 Z" fill="#f3cfc9" />
    </svg>
  )
}

/** Our coin: honey gold with Lean's ears on it. Always in colour. */
export function IconCoin({ className = '', title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.1em"
      height="1.1em"
      className={`${base} ${className}`}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <circle cx="12" cy="12" r="10.5" fill="#ffd77a" stroke="#c99a2e" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7.6" fill="none" stroke="#e0b34a" strokeWidth="1" />
      <path d="M7.4 16.2 C7.2 13.6 7.6 10.9 8.5 8.6 C10 10.3 11.1 12.7 11.5 15.7 Z" fill="#3d2a70" />
      <path d="M16.6 16.2 C16.8 13.6 16.4 10.9 15.5 8.6 C14 10.3 12.9 12.7 12.5 15.7 Z" fill="#3d2a70" />
      <path d="M8.5 15.3 C8.5 13.8 8.7 12.3 9.1 11.1 C9.9 12.1 10.4 13.3 10.6 14.9 Z" fill="#f3cfc9" />
      <path d="M15.5 15.3 C15.5 13.8 15.3 12.3 14.9 11.1 C14.1 12.1 13.6 13.3 13.4 14.9 Z" fill="#f3cfc9" />
    </svg>
  )
}
