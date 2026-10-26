import React from 'react';
import { icons, FolderPlus } from 'lucide-react';
import * as fas from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export const MILANOTE_SOLID_BOARD_COLORS = [
  '#dde1e7', '#6b7280', '#4de6c0', '#6ce858',
  '#f19e59', '#ffd046', '#ff8f35', '#f65555',
  '#fa65c2', '#a462fb', '#46b8fb', '#587af7'
];

export const MILANOTE_DIAGONAL_SWATCHES = [
  { name: 'orange-brown', bg: '#8c562e', gradient: 'linear-gradient(135deg, #e5985b 50%, #462817 50%)' },
  { name: 'beige-brown', bg: '#977258', gradient: 'linear-gradient(135deg, #d3c0b0 50%, #462817 50%)' },
  { name: 'olive-green', bg: '#757d54', gradient: 'linear-gradient(135deg, #c7cdb1 50%, #343c24 50%)' },
  { name: 'cream-rust', bg: '#b68356', gradient: 'linear-gradient(135deg, #f1ebb8 50%, #7e4d29 50%)' },
];

export const MILANOTE_PASTEL_COLORS = [
  '#d69068', '#cc907b', '#debba9', '#ded1c1', '#ded6b4',
  '#b6be9c', '#bec485'
];

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Semantic keyword-to-theme rules
const KEYWORD_THEMES: Array<{
  keywords: string[];
  icon: string;
  color: string;
}> = [
  {
    keywords: ['video', 'youtube', 'stream', 'twitch', 'cinema', 'movie', 'film', 'anim', 'vfx', 'clip', 'trailer', 'footage', 'render'],
    icon: 'Film',
    color: '#f65555'
  },
  {
    keywords: ['music', 'audio', 'sound', 'song', 'podcast', 'voice', 'track', 'ost', 'beat', 'album', 'record'],
    icon: 'Volume2',
    color: '#f37272'
  },
  {
    keywords: ['game', 'gaming', 'gamer', 'play', 'quest', 'boss', 'arcade', 'mechanic', 'level', 'rpg', 'unity', 'unreal', 'godot', 'steam'],
    icon: 'Gamepad2',
    color: '#a462fb'
  },
  {
    keywords: ['design', 'art', 'artist', 'drawing', 'sketch', 'illustration', 'visual', 'palette', 'moodboard', 'ui', 'ux', 'graphic', 'logo', 'brand', 'figma'],
    icon: 'Palette',
    color: '#fa65c2'
  },
  {
    keywords: ['code', 'dev', 'develop', 'software', 'engineer', 'programming', 'api', 'backend', 'frontend', 'tech', 'bug', 'script', 'database', 'sql', 'git', 'terminal'],
    icon: 'Code',
    color: '#46b8fb'
  },
  {
    keywords: ['story', 'lore', 'writing', 'write', 'book', 'novel', 'narrative', 'chapter', 'script', 'dialogue', 'author', 'screenplay'],
    icon: 'BookOpen',
    color: '#c27c3e'
  },
  {
    keywords: ['brain', 'idea', 'ideas', 'mind', 'concept', 'think', 'thought', 'storm', 'vision', 'strategy', 'plan', 'inspire', 'inspiration'],
    icon: 'Brain',
    color: '#4ca674'
  },
  {
    keywords: ['doc', 'docs', 'document', 'file', 'files', 'note', 'notes', 'paper', 'text', 'wiki', 'guide', 'manual', 'spec', 'readme'],
    icon: 'FileText',
    color: '#6bc8b3'
  },
  {
    keywords: ['task', 'tasks', 'todo', 'checklist', 'sprint', 'backlog', 'roadmap', 'project', 'work', 'board', 'kanban', 'milestone', 'action'],
    icon: 'SquareCheck',
    color: '#587af7'
  },
  {
    keywords: ['user', 'users', 'people', 'team', 'person', 'member', 'client', 'customer', 'profile', 'contact', 'staff', 'hr', 'lead'],
    icon: 'User',
    color: '#587af7'
  },
  {
    keywords: ['money', 'finance', 'budget', 'price', 'pricing', 'sales', 'revenue', 'cost', 'payment', 'coin', 'crypto', 'bank', 'dollar', 'invoice'],
    icon: 'DollarSign',
    color: '#4ca674'
  },
  {
    keywords: ['world', 'map', 'travel', 'trip', 'place', 'location', 'globe', 'geo', 'city', 'country', 'vacation', 'holiday'],
    icon: 'Globe',
    color: '#5dcbb2'
  },
  {
    keywords: ['shop', 'store', 'product', 'products', 'market', 'cart', 'order', 'merch', 'ecommerce', 'item', 'items', 'buy', 'sell'],
    icon: 'ShoppingBag',
    color: '#ff8f35'
  },
  {
    keywords: ['time', 'history', 'timeline', 'schedule', 'calendar', 'date', 'release', 'event', 'clock', 'deadline'],
    icon: 'History',
    color: '#df9a65'
  },
  {
    keywords: ['weapon', 'combat', 'battle', 'arsenal', 'armor', 'fight', 'gun', 'sword', 'attack', 'defense'],
    icon: 'Scale',
    color: '#e85c88'
  },
  {
    keywords: ['health', 'heart', 'fit', 'fitness', 'gym', 'sport', 'workout', 'exercise', 'diet', 'wellness', 'medical'],
    icon: 'Heart',
    color: '#f65555'
  },
  {
    keywords: ['science', 'lab', 'research', 'study', 'data', 'analytics', 'chart', 'metric', 'experiment', 'test', 'math', 'ai'],
    icon: 'FlaskConical',
    color: '#a462fb'
  },
  {
    keywords: ['photo', 'photography', 'camera', 'picture', 'image', 'shoot', 'pic', 'snapshot', 'gallery'],
    icon: 'Camera',
    color: '#6b7280'
  },
  {
    keywords: ['setting', 'settings', 'config', 'configuration', 'system', 'setup', 'admin', 'preference', 'tool', 'tools'],
    icon: 'Settings',
    color: '#6b7280'
  },
  {
    keywords: ['goal', 'target', 'kpi', 'trophy', 'win', 'winner', 'award', 'achievement', 'success', 'prize'],
    icon: 'Trophy',
    color: '#ffd046'
  },
  {
    keywords: ['social', 'share', 'network', 'link', 'collab', 'relation', 'connection', 'outreach', 'marketing', 'ad', 'campaign'],
    icon: 'Share2',
    color: '#ff4c78'
  },
  {
    keywords: ['security', 'shield', 'safe', 'lock', 'key', 'privacy', 'auth', 'pass', 'password'],
    icon: 'Shield',
    color: '#4ca674'
  },
  {
    keywords: ['asset', 'assets', 'layer', 'layers', '3d', 'model', 'mesh', 'texture', 'component', 'components'],
    icon: 'Layers',
    color: '#ffd185'
  }
];

export function getBoardThemeForTitle(title: string = ''): { icon: string; color: string; isInitialLetter?: boolean } {
  const trimmed = title.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed || lower === 'new board' || lower === 'untitled' || lower === 'untitled board') {
    return {
      icon: 'FolderPlus',
      color: '#6b7280',
    };
  }

  // 1. Check keyword themes
  for (const item of KEYWORD_THEMES) {
    if (item.keywords.some((kw) => lower.includes(kw))) {
      return {
        icon: item.icon,
        color: item.color,
      };
    }
  }

  // 2. Check initial character (letter or number)
  const firstMatch = trimmed.match(/[a-zA-Z0-9]/);
  if (firstMatch) {
    const ch = firstMatch[0].toUpperCase();
    const hash = hashString(trimmed);
    const color = MILANOTE_SOLID_BOARD_COLORS[Math.abs(hash) % MILANOTE_SOLID_BOARD_COLORS.length];
    return {
      icon: `char:${ch}`,
      color,
      isInitialLetter: true,
    };
  }

  // Fallback
  return {
    icon: 'FolderPlus',
    color: '#6b7280',
  };
}

export const CheckerboardIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="2" width="5" height="5" fill={color} />
    <rect x="12" y="2" width="5" height="5" fill={color} />
    <rect x="7" y="7" width="5" height="5" fill={color} />
    <rect x="17" y="7" width="5" height="5" fill={color} />
    <rect x="2" y="12" width="5" height="5" fill={color} />
    <rect x="12" y="12" width="5" height="5" fill={color} />
    <rect x="7" y="17" width="5" height="5" fill={color} />
    <rect x="17" y="17" width="5" height="5" fill={color} />
  </svg>
);

export const BoardIconRenderer: React.FC<{
  iconName?: string | null;
  imageUrl?: string | null;
  size?: number;
  color?: string;
  isBadge?: boolean;
}> = ({ iconName, imageUrl, size = 24, color = '#ffffff', isBadge = false }) => {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 'inherit'
        }}
      />
    );
  }

  const raw = iconName || 'FolderPlus';

  // Handle boxed icons (e.g. boxed:Star, boxed:fa:faBook, boxed:char:Y)
  if (raw.startsWith('boxed:')) {
    const inner = raw.slice(6);
    return (
      <div
        style={{
          width: isBadge ? Math.round(size * 1.25) : Math.max(34, size),
          height: isBadge ? Math.round(size * 1.25) : Math.max(34, size),
          background: isBadge ? 'rgba(0,0,0,0.22)' : '#383a40',
          border: isBadge ? '1.5px solid rgba(255,255,255,0.45)' : '1px solid rgba(255,255,255,0.18)',
          borderRadius: isBadge ? '12px' : '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <BoardIconRenderer
          iconName={inner}
          size={Math.round(size * 0.6)}
          color={color}
          isBadge={false}
        />
      </div>
    );
  }

  // Handle plain characters (letters & numbers)
  if (raw.startsWith('char:')) {
    const ch = raw.slice(5);
    return (
      <span
        style={{
          fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
          fontWeight: 700,
          fontSize: `${Math.round(size * 0.95)}px`,
          lineHeight: 1,
          color,
          display: 'inline-block',
          userSelect: 'none'
        }}
      >
        {ch}
      </span>
    );
  }

  // Handle Checkerboard
  if (raw === 'Checkerboard') {
    return <CheckerboardIcon size={size} color={color} />;
  }

  // Handle FontAwesome icons (fa:faBookOpen or faBookOpen)
  if (raw.startsWith('fa:') || (raw.startsWith('fa') && (fas as Record<string, any>)[raw])) {
    const faKey = raw.startsWith('fa:') ? raw.slice(3) : raw;
    const faDef = (fas as Record<string, any>)[faKey];
    if (faDef) {
      return (
        <FontAwesomeIcon
          icon={faDef}
          style={{
            fontSize: `${size}px`,
            width: `${size}px`,
            height: `${size}px`,
            color
          }}
        />
      );
    }
  }

  // Handle Lucide icons
  const LucideComponent = (icons as Record<string, any>)[raw] || FolderPlus;
  return <LucideComponent size={size} color={color} />;
};

/**
 * Returns dynamic "Recommended" icons for a given board title matching Image 1 layout:
 * Row 1: boxed:Star, boxed:ArrowUpRight, boxed:Checkerboard, boxed:char:${initial}
 * Row 2: AppWindow, Grid2x2, Shapes, char:${initial}
 * Row 3: char:1, char:2, char:3, char:4
 * Row 4: char:5, char:6, char:7, char:8
 * Row 5+: char:9, char:0, keyword icons, core favorites
 */
export function getRecommendedIcons(title: string = ''): string[] {
  const trimmed = title.trim();
  const match = trimmed.match(/[a-zA-Z0-9]/);
  const initial = match ? match[0].toUpperCase() : 'Y';

  const row1 = [
    'boxed:Star',
    'boxed:ArrowUpRight',
    'boxed:Checkerboard',
    `boxed:char:${initial}`
  ];

  const row2 = [
    'AppWindow',
    'Grid2x2',
    'Shapes',
    `char:${initial}`
  ];

  const row3 = ['char:1', 'char:2', 'char:3', 'char:4'];
  const row4 = ['char:5', 'char:6', 'char:7', 'char:8'];
  const row5 = ['char:9', 'char:0'];

  // Keyword matched icons for current board
  const lower = trimmed.toLowerCase();
  const matchedTheme = KEYWORD_THEMES.find((th) => th.keywords.some((k) => lower.includes(k)));
  const contextualIcons: string[] = matchedTheme ? [matchedTheme.icon] : [];

  // General popular Milanote staples
  const popularStaples = [
    'Bookmark', 'Heart', 'Sparkles', 'Zap', 'Flame', 'Trophy', 'Target', 'Rocket',
    'Gamepad2', 'Palette', 'BookOpen', 'FileText', 'Camera', 'Volume2', 'DollarSign',
    'User', 'Users', 'Globe', 'Coffee', 'FolderPlus', 'LayoutGrid', 'Compass',
    'Crosshair', 'Award', 'Crown', 'Gem', 'Shield', 'Smile'
  ];

  const combined = [
    ...row1,
    ...row2,
    ...row3,
    ...row4,
    ...row5,
    ...contextualIcons,
    ...popularStaples
  ];

  return Array.from(new Set(combined));
}

// EXACT MILANOTE STORY ICONS (MATCHING USER IMAGES 2, 3, 4)
export const STORY_ICONS: string[] = [
  'fa:faBookAtlas',
  'fa:faBookBookmark',
  'fa:faBookOpen',
  'fa:faScroll',
  'fa:faKeyboard',
  'fa:faBook',
  'Library',
  'fa:faBookOpenReader',
  'fa:faFileLines',
  'fa:faShopLock',
  'fa:faFont',
  'fa:faFilm',
  'fa:faCirclePause',
  'fa:faDroplet',
  'fa:faUmbrella',
  'fa:faWind',
  'fa:faShop',
  'fa:faCloudRain',
  'fa:faTractor',
  'fa:faPen',
  'fa:faCloudShowersHeavy',
  'fa:faCloudSunRain',
  'fa:faCloudShowersWater',
  'fa:faCloud',
  'fa:faHurricane',
  'fa:faShopSlash',
  'fa:faBagShopping',
  'fa:faCloudBolt',
  'fa:faCloudMeatball',
  'fa:faPenNib',
  'fa:faCloudMoonRain',
  'fa:faSunPlantWilt',
  'fa:faPenFancy',
  'fa:faBookJournalWhills',
  'fa:faBookSkull',
  'fa:faFeather',
  'fa:faFeatherPointed',
  'fa:faMasksTheater',
  'fa:faQuoteLeft',
  'fa:faComments',
  'fa:faHourglassHalf',
  'fa:faTimeline',
  'fa:faCrown',
  'fa:faLandmark',
  'fa:faDragon',
  'fa:faGhost',
  'fa:faWandMagicSparkles',
  'BookOpen',
  'Book',
  'Bookmark',
  'Scroll',
  'Feather',
  'PenTool',
  'Library',
  'NotebookTabs',
  'FileText',
  'Drama',
  'Quote',
  'Sparkles',
  'Compass',
  'Map'
];

export const NARRATIVE_ICONS: string[] = [
  'fa:faScroll',
  'fa:faBookOpen',
  'fa:faFeather',
  'fa:faFeatherPointed',
  'fa:faMasksTheater',
  'fa:faFilm',
  'fa:faPhotoFilm',
  'fa:faPenNib',
  'fa:faPenFancy',
  'fa:faQuoteLeft',
  'fa:faCommentDots',
  'fa:faComments',
  'fa:faBookBookmark',
  'fa:faFileLines',
  'fa:faScrollTorah',
  'fa:faUserPen',
  'fa:faBookReader',
  'fa:faCompass',
  'fa:faHourglassHalf',
  'fa:faTimeline',
  'fa:faBookSkull',
  'fa:faCrown',
  'fa:faLandmark',
  'fa:faShieldHalved',
  'fa:faEye',
  'fa:faSkull',
  'fa:faGhost',
  'fa:faDragon',
  'fa:faWandMagicSparkles',
  'BookOpen',
  'Scroll',
  'FileText',
  'Feather',
  'History',
  'Compass',
  'Layers',
  'Brain'
];

export const GAMING_ICONS: string[] = [
  'fa:faGamepad',
  'fa:faDice',
  'fa:faDiceD20',
  'fa:faDiceD6',
  'fa:faChess',
  'fa:faChessKnight',
  'fa:faChessQueen',
  'fa:faChessKing',
  'fa:faTrophy',
  'fa:faCrown',
  'fa:faMedal',
  'fa:faAward',
  'fa:faCrosshairs',
  'fa:faDragon',
  'fa:faGhost',
  'fa:faSkull',
  'fa:faHeadset',
  'fa:faShieldHalved',
  'fa:faWandMagicSparkles',
  'fa:faPuzzlePiece',
  'fa:faBolt',
  'fa:faFire',
  'fa:faBomb',
  'fa:faFlag',
  'fa:faHeart',
  'fa:faCoins',
  'Gamepad2',
  'Trophy',
  'Target',
  'Flame',
  'Zap',
  'Crosshair',
  'Crown',
  'Award',
  'Sparkles',
  'Shield'
];

export const CHARACTERS_RPG_ICONS: string[] = [
  'fa:faUserNinja',
  'fa:faUserAstronaut',
  'fa:faUserSecret',
  'fa:faMask',
  'fa:faDragon',
  'fa:faGhost',
  'fa:faSkull',
  'fa:faRobot',
  'fa:faCat',
  'fa:faDog',
  'fa:faHorse',
  'fa:faCrow',
  'fa:faHatWizard',
  'fa:faShieldCat',
  'fa:faHandFist',
  'fa:faHeartPulse',
  'fa:faShieldHeart',
  'fa:faBiohazard',
  'fa:faRadiation',
  'fa:faGem',
  'User',
  'Users',
  'Smile',
  'Ghost',
  'Skull',
  'Bot',
  'Gem',
  'Crown',
  'Heart',
  'Eye'
];

export const DESIGN_ICONS: string[] = [
  'fa:faPalette',
  'fa:faPaintRoller',
  'fa:faBrush',
  'fa:faPenNib',
  'fa:faPenRuler',
  'fa:faPencilRuler',
  'fa:faSwatchbook',
  'fa:faCropSimple',
  'fa:faEyeDropper',
  'fa:faVectorPolygon',
  'fa:faObjectGroup',
  'fa:faObjectUngroup',
  'fa:faShapes',
  'fa:faLayerGroup',
  'fa:faCompassDrafting',
  'fa:faScissors',
  'fa:faWandMagicSparkles',
  'fa:faImage',
  'fa:faImages',
  'fa:faCameraRetro',
  'Palette',
  'PenTool',
  'Layers',
  'Shapes',
  'LayoutGrid',
  'AppWindow',
  'Crop',
  'Scissors',
  'Figma',
  'Sparkles'
];

export const ART_GRAPHICS_ICONS: string[] = [
  'fa:faCamera',
  'fa:faCameraRetro',
  'fa:faImages',
  'fa:faImage',
  'fa:faCrop',
  'fa:faStamp',
  'fa:faFillDrip',
  'fa:faHighlighter',
  'fa:faMarker',
  'fa:faIcons',
  'fa:faCompassDrafting',
  'fa:faBezierCurve',
  'fa:faFont',
  'fa:faTextWidth',
  'fa:faFontAwesome',
  'Camera',
  'Image',
  'Palette',
  'Shapes',
  'Sparkles',
  'Sun',
  'Moon'
];

export const MUSIC_ICONS: string[] = [
  'fa:faMusic',
  'fa:faHeadphones',
  'fa:faMicrophone',
  'fa:faMicrophoneLines',
  'fa:faVolumeHigh',
  'fa:faVolumeLow',
  'fa:faGuitar',
  'fa:faDrum',
  'fa:faRecordVinyl',
  'fa:faRadio',
  'fa:faCompactDisc',
  'fa:faWaveSquare',
  'fa:faPodcast',
  'fa:faSliders',
  'fa:faPlay',
  'fa:faForward',
  'Volume2',
  'Music',
  'Headphones',
  'Mic',
  'Radio',
  'Disc',
  'AudioLines',
  'AudioWaveform',
  'SlidersHorizontal'
];

export const AUDIO_SOUND_ICONS: string[] = [
  'fa:faVolumeHigh',
  'fa:faVolumeXmark',
  'fa:faBell',
  'fa:faBullhorn',
  'fa:faEarListen',
  'fa:faHeadset',
  'fa:faPodcast',
  'fa:faFileAudio',
  'fa:faMusic',
  'fa:faRadio',
  'Volume2',
  'Headphones',
  'Mic',
  'AudioLines'
];

export const DEVELOPMENT_ICONS: string[] = [
  'fa:faCode',
  'fa:faCodeBranch',
  'fa:faCodeCommit',
  'fa:faCodePullRequest',
  'fa:faTerminal',
  'fa:faBug',
  'fa:faDatabase',
  'fa:faServer',
  'fa:faMicrochip',
  'fa:faLaptopCode',
  'fa:faFolderTree',
  'fa:faSitemap',
  'fa:faNetworkWired',
  'fa:faRobot',
  'fa:faShieldHalved',
  'fa:faKey',
  'fa:faLock',
  'Code',
  'Terminal',
  'Cpu',
  'GitBranch',
  'GitCommitHorizontal',
  'GitPullRequest',
  'Database',
  'Server',
  'HardDrive',
  'Bug',
  'FolderGit2'
];

export const TECH_SYSTEM_ICONS: string[] = [
  'fa:faServer',
  'fa:faHardDrive',
  'fa:faMemory',
  'fa:faDesktop',
  'fa:faMobileScreen',
  'fa:faTabletScreenButton',
  'fa:faWifi',
  'fa:faEthernet',
  'fa:faCloud',
  'fa:faPlug',
  'fa:faGear',
  'fa:faGears',
  'fa:faWrench',
  'fa:faSliders',
  'Cpu',
  'Monitor',
  'Smartphone',
  'Tablet',
  'HardDrive',
  'Server',
  'Network'
];

export const MARKETING_ICONS: string[] = [
  'fa:faBullhorn',
  'fa:faChartLine',
  'fa:faChartPie',
  'fa:faChartSimple',
  'fa:faDollarSign',
  'fa:faCoins',
  'fa:faCreditCard',
  'fa:faWallet',
  'fa:faPiggyBank',
  'fa:faBagShopping',
  'fa:faCartShopping',
  'fa:faStore',
  'fa:faBriefcase',
  'fa:faBuilding',
  'fa:faHandshake',
  'fa:faBullseye',
  'DollarSign',
  'ShoppingBag',
  'TrendingUp',
  'CreditCard',
  'Briefcase',
  'Building',
  'Target',
  'Trophy',
  'Share2'
];

export const BUSINESS_FINANCE_ICONS: string[] = [
  'fa:faDollarSign',
  'fa:faMoneyBillWave',
  'fa:faCoins',
  'fa:faCreditCard',
  'fa:faReceipt',
  'fa:faFileInvoiceDollar',
  'fa:faScaleBalanced',
  'fa:faLandmark',
  'fa:faVault',
  'fa:faPiggyBank',
  'fa:faChartColumn',
  'fa:faArrowTrendUp',
  'DollarSign',
  'Scale',
  'Building',
  'CreditCard'
];

export const TASKS_PLANNING_ICONS: string[] = [
  'fa:faListCheck',
  'fa:faSquareCheck',
  'fa:faCalendarDays',
  'fa:faClock',
  'fa:faHourglassHalf',
  'fa:faBullseye',
  'fa:faFlagCheckered',
  'fa:faTimeline',
  'fa:faClipboardCheck',
  'fa:faThumbtack',
  'fa:faPaperclip',
  'fa:faBoxesStacked',
  'fa:faArrowsSplitUpAndLeft',
  'fa:faArrowsTurnRight',
  'SquareCheck',
  'ListTodo',
  'Calendar',
  'Clock',
  'Target',
  'Flag',
  'Milestone',
  'Kanban',
  'Table'
];

export const NEW_BOARD_ICONS: string[] = [
  'Sparkles', 'Flame', 'Zap', 'Bot', 'Wand', 'WandSparkles', 'Lightbulb', 'Rocket', 'Trophy', 'Gem',
  'Cpu', 'Orbit', 'Atom', 'Crosshair', 'Award', 'Crown', 'Fingerprint', 'Radio',
  'Eye', 'Scan', 'SlidersVertical', 'Dna', 'Telescope', 'Layers', 'Smile', 'ThumbsUp',
  'Coffee', 'CloudSun', 'Sun', 'Moon', 'Ghost', 'Skull', 'ShieldCheck', 'Terminal', 'Bug',
  'FolderGit2', 'HeartHandshake', 'PartyPopper', 'Palette', 'Activity', 'BadgeCheck',
  'Binary', 'Hourglass', 'CircleCheck'
];

export const WORKSPACE_BOARD_ICONS: string[] = [
  'FolderPlus', 'Folder', 'FolderKanban', 'FolderTree', 'FolderGit2', 'Folders',
  'LayoutDashboard', 'LayoutGrid', 'LayoutList', 'Columns2', 'Columns3', 'Kanban', 'Table',
  'FileText', 'Files', 'FileSpreadsheet', 'FileCode', 'BookOpen', 'Book', 'Bookmark',
  'Archive', 'Box', 'Package', 'Clipboard', 'ClipboardList', 'SquareCheck', 'ListTodo',
  'Grid3x3', 'MapPin', 'Compass', 'Milestone', 'Flag', 'Target', 'Pin', 'Paperclip',
  'Tags', 'Presentation', 'Briefcase', 'Building', 'Monitor', 'Smartphone', 'Tablet',
  'Laptop', 'Network', 'Workflow', 'Share2', 'Scale', 'History', 'Calendar',
  'Clock', 'CircleCheck', 'ListChecks', 'Library', 'Newspaper', 'PanelLeft',
  'Scroll', 'StickyNote', 'Store', 'Warehouse', 'Wrench', 'Search', 'SlidersHorizontal',
  'GitBranch', 'GitCommitHorizontal', 'GitPullRequest', 'Database', 'Server', 'HardDrive',
  'Inbox', 'Send', 'Mail', 'Phone', 'Shield', 'Key', 'Lock', 'LockOpen', 'Printer'
];

export const LETTERS_AND_NUMBERS_ICONS: string[] = (() => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const numbers = '0123456789'.split('');
  const symbols = ['#', '$', '%', '&', '@', '!', '?', '+', '='];

  const plainLetters = letters.map((l) => `char:${l}`);
  const boxedLetters = letters.map((l) => `boxed:char:${l}`);
  const plainNumbers = numbers.map((n) => `char:${n}`);
  const boxedNumbers = numbers.map((n) => `boxed:char:${n}`);
  const plainSymbols = symbols.map((s) => `char:${s}`);

  return [
    ...plainLetters,
    ...boxedLetters,
    ...plainNumbers,
    ...boxedNumbers,
    ...plainSymbols
  ];
})();

/**
 * Returns dynamic categories matching board context
 */
export function getIconCategoriesForBoard(title: string = ''): string[] {
  const lower = title.toLowerCase().trim();

  if (/story|narrative|lore|book|novel|writing|write|author|chapter|script|plot/i.test(lower)) {
    return ['Recommended', 'Narrative', 'Story', 'Letters & numbers', 'Upload an image'];
  }
  if (/game|gaming|gamer|rpg|arcade|quest|boss|level|mechanic/i.test(lower)) {
    return ['Recommended', 'Gaming', 'Characters & RPG', 'Letters & numbers', 'Upload an image'];
  }
  if (/design|art|artist|drawing|visual|palette|moodboard|ui|ux|graphic|logo|brand|illustration/i.test(lower)) {
    return ['Recommended', 'Design', 'Art & Graphics', 'Letters & numbers', 'Upload an image'];
  }
  if (/music|audio|sound|song|podcast|track|voice|beat|album|record/i.test(lower)) {
    return ['Recommended', 'Music', 'Audio & Sound', 'Letters & numbers', 'Upload an image'];
  }
  if (/code|dev|develop|software|engineer|programming|api|tech|bug|script|database|git/i.test(lower)) {
    return ['Recommended', 'Development', 'Tech & System', 'Letters & numbers', 'Upload an image'];
  }
  if (/market|marketing|business|finance|money|sales|budget|price|crypto|revenue/i.test(lower)) {
    return ['Recommended', 'Marketing', 'Business & Finance', 'Letters & numbers', 'Upload an image'];
  }
  if (/task|tasks|todo|project|sprint|roadmap|plan|milestone|checklist|work/i.test(lower)) {
    return ['Recommended', 'Tasks & Planning', 'Board', 'Letters & numbers', 'Upload an image'];
  }

  // Default
  return ['Recommended', 'New', 'Board', 'Letters & numbers', 'Upload an image'];
}

/**
 * Returns icons for any category name
 */
export function getIconsForCategory(category: string, title: string = ''): string[] {
  switch (category) {
    case 'Recommended':
      return getRecommendedIcons(title);
    case 'Story':
      return STORY_ICONS;
    case 'Narrative':
      return NARRATIVE_ICONS;
    case 'Gaming':
      return GAMING_ICONS;
    case 'Characters & RPG':
      return CHARACTERS_RPG_ICONS;
    case 'Design':
      return DESIGN_ICONS;
    case 'Art & Graphics':
      return ART_GRAPHICS_ICONS;
    case 'Music':
      return MUSIC_ICONS;
    case 'Audio & Sound':
      return AUDIO_SOUND_ICONS;
    case 'Development':
      return DEVELOPMENT_ICONS;
    case 'Tech & System':
      return TECH_SYSTEM_ICONS;
    case 'Marketing':
      return MARKETING_ICONS;
    case 'Business & Finance':
      return BUSINESS_FINANCE_ICONS;
    case 'Tasks & Planning':
      return TASKS_PLANNING_ICONS;
    case 'New':
      return NEW_BOARD_ICONS;
    case 'Board':
      return WORKSPACE_BOARD_ICONS;
    case 'Letters & numbers':
      return LETTERS_AND_NUMBERS_ICONS;
    default:
      return WORKSPACE_BOARD_ICONS;
  }
}

// Synonyms map for rich search
const ICON_SYNONYMS: Record<string, string[]> = {
  story: ['book', 'scroll', 'pen', 'feather', 'read', 'story', 'write', 'keyboard', 'typewriter', 'cloud', 'rain', 'umbrella', 'wind', 'store', 'film', 'drama', 'quote', 'novel', 'lore', 'author', 'chapter', 'script'],
  stories: ['book', 'scroll', 'pen', 'feather', 'read', 'story', 'write', 'keyboard', 'typewriter', 'cloud', 'rain', 'umbrella', 'wind', 'store', 'film', 'drama', 'quote', 'novel', 'lore', 'author', 'chapter', 'script'],
  narrative: ['story', 'book', 'scroll', 'pen', 'feather', 'theater', 'mask', 'quote', 'comment', 'film', 'timeline', 'lore', 'character', 'dialogue'],
  book: ['book', 'scroll', 'bookmark', 'read', 'notebook', 'library', 'journal', 'page', 'magazine', 'atlas', 'bible'],
  books: ['book', 'scroll', 'bookmark', 'read', 'notebook', 'library', 'journal', 'page'],
  game: ['game', 'gamepad', 'dice', 'chess', 'trophy', 'sword', 'shield', 'skull', 'ghost', 'arcade', 'crown', 'puzzle', 'rpg', 'quest', 'boss', 'level'],
  games: ['game', 'gamepad', 'dice', 'chess', 'trophy', 'sword', 'shield', 'skull', 'ghost', 'arcade', 'crown', 'puzzle'],
  gaming: ['game', 'gamepad', 'dice', 'chess', 'trophy', 'sword', 'shield', 'skull', 'ghost', 'arcade', 'crown', 'puzzle'],
  music: ['music', 'audio', 'sound', 'volume', 'headphone', 'mic', 'radio', 'guitar', 'record', 'disc', 'drum', 'wave', 'song', 'track', 'album', 'podcast'],
  audio: ['music', 'audio', 'sound', 'volume', 'headphone', 'mic', 'radio', 'speaker'],
  sound: ['music', 'audio', 'sound', 'volume', 'bell', 'speaker', 'wave'],
  code: ['code', 'terminal', 'bug', 'cpu', 'database', 'server', 'laptop', 'chip', 'network', 'binary', 'robot', 'git', 'develop', 'program', 'script', 'tech'],
  dev: ['code', 'terminal', 'bug', 'cpu', 'database', 'server', 'git'],
  design: ['palette', 'brush', 'pen', 'layer', 'shape', 'scissors', 'crop', 'figma', 'draw', 'art', 'vector', 'swatch', 'color', 'visual'],
  art: ['palette', 'brush', 'pen', 'drawing', 'canvas', 'paint', 'image', 'camera'],
  weather: ['cloud', 'rain', 'sun', 'moon', 'storm', 'wind', 'snow', 'umbrella', 'hurricane', 'bolt', 'rainbow', 'droplet', 'hail'],
  rain: ['cloud', 'rain', 'umbrella', 'droplet', 'water', 'storm', 'wind'],
  write: ['pen', 'pencil', 'quill', 'feather', 'write', 'typewriter', 'keyboard', 'scroll', 'edit', 'note'],
  writing: ['pen', 'pencil', 'quill', 'feather', 'write', 'typewriter', 'keyboard', 'scroll', 'edit', 'note'],
  pen: ['pen', 'pencil', 'quill', 'nib', 'feather', 'edit', 'draw'],
  people: ['user', 'people', 'person', 'team', 'member', 'group', 'family', 'profile', 'avatar', 'face', 'child'],
  user: ['user', 'people', 'person', 'team', 'profile', 'avatar'],
  money: ['dollar', 'coin', 'money', 'cash', 'credit', 'card', 'wallet', 'bank', 'finance', 'budget', 'pay', 'price'],
  finance: ['dollar', 'coin', 'money', 'cash', 'credit', 'card', 'wallet', 'bank', 'chart'],
  travel: ['globe', 'map', 'compass', 'plane', 'car', 'train', 'ship', 'luggage', 'vacation', 'trip', 'place', 'location', 'pin'],
  map: ['map', 'compass', 'globe', 'location', 'pin', 'route', 'navigation'],
  food: ['coffee', 'cup', 'mug', 'pizza', 'burger', 'apple', 'utensils', 'cutlery', 'wine', 'beer', 'cake', 'food', 'drink', 'cafe'],
  coffee: ['coffee', 'cup', 'mug', 'tea', 'cafe', 'drink'],
  time: ['clock', 'watch', 'calendar', 'history', 'time', 'date', 'schedule', 'hour', 'timer', 'timeline'],
  tool: ['wrench', 'gear', 'hammer', 'screwdriver', 'tool', 'setting', 'slider', 'config', 'build', 'repair'],
  tools: ['wrench', 'gear', 'hammer', 'screwdriver', 'tool', 'setting'],
  chat: ['message', 'chat', 'comment', 'bubble', 'mail', 'envelope', 'send', 'phone', 'talk', 'speech'],
  star: ['star', 'sparkle', 'rating', 'favorite', 'award', 'badge'],
  heart: ['heart', 'love', 'health', 'like', 'medical', 'hospital'],
  love: ['heart', 'love', 'smile', 'kiss', 'gift'],
  security: ['shield', 'lock', 'key', 'safe', 'privacy', 'auth', 'password', 'fingerprint', 'unlock'],
  lock: ['lock', 'key', 'shield', 'safe'],
  nature: ['tree', 'leaf', 'flower', 'plant', 'mountain', 'water', 'fire', 'forest', 'earth', 'seed']
};

const ALL_FA_KEYS = Object.keys(fas).filter(
  (k) => k.startsWith('fa') && typeof (fas as Record<string, any>)[k] === 'object'
);

const ALL_LUCIDE_NAMES = Object.keys(icons).filter(
  (name) => typeof (icons as Record<string, any>)[name] === 'object' && name !== 'createLucideIcon'
);

export function searchBoardIcons(query: string): string[] {
  let q = query.toLowerCase().trim();
  if (!q) return [];

  // Match letters or numbers
  const matchedChars: string[] = [];
  if (q.length === 1 && /[a-z0-9]/i.test(q)) {
    const ch = q.toUpperCase();
    matchedChars.push(`boxed:char:${ch}`, `char:${ch}`);
  }

  // Match checkerboard
  const matchedCustom: string[] = [];
  if ('checkerboard'.includes(q) || 'chess'.includes(q)) {
    matchedCustom.push('boxed:Checkerboard', 'Checkerboard');
  }

  // Check synonym terms
  let singular = q;
  if (singular.endsWith('s') && singular.length > 3) singular = singular.slice(0, -1);
  const terms = Array.from(new Set([q, singular, ...(ICON_SYNONYMS[q] || []), ...(ICON_SYNONYMS[singular] || [])]));

  const resultSet = new Set<string>();

  // Curated category shortcuts
  if (q === 'story' || q === 'stories' || q === 'narrative' || q === 'book' || q === 'books') {
    STORY_ICONS.forEach((ic) => resultSet.add(ic));
  } else if (q === 'game' || q === 'gaming' || q === 'games' || q === 'rpg') {
    GAMING_ICONS.forEach((ic) => resultSet.add(ic));
    CHARACTERS_RPG_ICONS.forEach((ic) => resultSet.add(ic));
  } else if (q === 'music' || q === 'audio' || q === 'sound' || q === 'song') {
    MUSIC_ICONS.forEach((ic) => resultSet.add(ic));
    AUDIO_SOUND_ICONS.forEach((ic) => resultSet.add(ic));
  } else if (q === 'design' || q === 'art' || q === 'draw') {
    DESIGN_ICONS.forEach((ic) => resultSet.add(ic));
    ART_GRAPHICS_ICONS.forEach((ic) => resultSet.add(ic));
  } else if (q === 'code' || q === 'dev' || q === 'tech' || q === 'system') {
    DEVELOPMENT_ICONS.forEach((ic) => resultSet.add(ic));
    TECH_SYSTEM_ICONS.forEach((ic) => resultSet.add(ic));
  } else if (q === 'task' || q === 'tasks' || q === 'todo' || q === 'plan' || q === 'planning') {
    TASKS_PLANNING_ICONS.forEach((ic) => resultSet.add(ic));
  } else if (q === 'business' || q === 'finance' || q === 'money' || q === 'marketing') {
    MARKETING_ICONS.forEach((ic) => resultSet.add(ic));
    BUSINESS_FINANCE_ICONS.forEach((ic) => resultSet.add(ic));
  }

  // Check each term across FontAwesome and Lucide
  for (const t of terms) {
    // Search FontAwesome
    for (const faKey of ALL_FA_KEYS) {
      if (faKey.toLowerCase().includes(t)) {
        resultSet.add(`fa:${faKey}`);
        if (resultSet.size >= 120) break;
      }
    }

    // Search Lucide
    for (const lName of ALL_LUCIDE_NAMES) {
      if (lName.toLowerCase().includes(t)) {
        resultSet.add(lName);
        if (resultSet.size >= 120) break;
      }
    }
  }

  return [...matchedChars, ...matchedCustom, ...Array.from(resultSet)].slice(0, 100);
}
