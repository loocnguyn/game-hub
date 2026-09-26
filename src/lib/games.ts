// Catalog of everything shown on the hub.
export type GameCategory = 'arcade' | 'board' | 'cards' | 'puzzle' | 'casino';

export interface GameInfo {
  id: string;
  name: string;
  tagline: string;
  category: GameCategory;
  href: string;
  players: string;
  icon: string; // emoji/glyph used on cards and in menus
  accent: string; // CSS colour for the card glow
  accent2: string;
  badges?: string[];
  comingSoon?: boolean;
  external?: boolean;
}

export const CATEGORIES: { id: GameCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'arcade', label: 'Arcade' },
  { id: 'board', label: 'Cờ & đối kháng' },
  { id: 'cards', label: 'Bài' },
  { id: 'puzzle', label: 'Giải đố' },
  { id: 'casino', label: 'Casino (chip ảo)' },
];

export const GAMES: GameInfo[] = [
  { id: 'tetris', name: 'Tetris Neon', tagline: 'Chơi vô tận có bảng xếp hạng, đấu 1v1 tính giờ', category: 'arcade', href: '/tetris', players: '1–2', icon: '▦', accent: '#22d3ee', accent2: '#a855f7', badges: ['3D', 'Xếp hạng', '1v1'] },
  { id: 'chess', name: 'Cờ vua', tagline: 'Đấu online có đồng hồ, có bàn 3D', category: 'board', href: '/play/chess', players: '2', icon: '♞', accent: '#f59e0b', accent2: '#ef4444', badges: ['Online', 'Elo', '3D'] },
  { id: 'xiangqi', name: 'Cờ tướng', tagline: 'Đấu online có đồng hồ', category: 'board', href: '/play/xiangqi', players: '2', icon: '帥', accent: '#ef4444', accent2: '#f59e0b', badges: ['Online', 'Elo'] },
  { id: 'caro', name: 'Caro', tagline: '5 quân liền là thắng, tùy chọn chặn 2 đầu', category: 'board', href: '/play/caro', players: '2', icon: '✕', accent: '#38bdf8', accent2: '#f472b6', badges: ['Online', 'Elo'] },
  { id: 'dots', name: 'Dots and Boxes', tagline: 'Nối điểm để chiếm ô, chiếm được thì đi tiếp', category: 'board', href: '/play/dots', players: '2', icon: '⊡', accent: '#34d399', accent2: '#22d3ee', badges: ['Online'] },
  { id: 'monopoly', name: 'Cờ tỉ phú', tagline: 'Mua đất, xây nhà, 2–6 người', category: 'board', href: '/play/monopoly', players: '2–6', icon: '🏙', accent: '#22c55e', accent2: '#eab308', badges: ['Online', 'Nhiều người'] },
  { id: 'tienlen', name: 'Tiến lên miền Nam', tagline: '2–4 người, luật miền Nam', category: 'cards', href: '/play/tienlen', players: '2–4', icon: '🂡', accent: '#f43f5e', accent2: '#fb923c', badges: ['Online'] },
  { id: 'poker', name: 'Royal Poker', tagline: "Texas Hold'em Sit & Go", category: 'cards', href: '/poker/index.html', players: '2–9', icon: '♠', accent: '#e2b75a', accent2: '#10b981', badges: ['Online'], external: true },
  { id: 'minesweeper', name: 'Dò mìn', tagline: '3 cấp độ, xếp hạng theo thời gian', category: 'puzzle', href: '/minesweeper', players: '1', icon: '✹', accent: '#94a3b8', accent2: '#22d3ee', badges: ['Xếp hạng'] },
  { id: '2048', name: '2048', tagline: 'Gộp ô, có bảng xếp hạng', category: 'puzzle', href: '/2048', players: '1', icon: '⧉', accent: '#fbbf24', accent2: '#f97316', badges: ['Xếp hạng'] },
  { id: 'sudoku', name: 'Sudoku', tagline: '4 độ khó, xếp hạng theo thời gian', category: 'puzzle', href: '/sudoku', players: '1', icon: '⑨', accent: '#818cf8', accent2: '#22d3ee', badges: ['Xếp hạng'] },
  { id: 'sicbo', name: 'Sicbo', tagline: '3 xúc xắc, tài xỉu', category: 'casino', href: '/casino/sicbo', players: 'Nhiều', icon: '⚄', accent: '#dc2626', accent2: '#fbbf24', badges: ['Chip ảo'] },
  { id: 'roulette', name: 'Roulette', tagline: 'Roulette châu Âu', category: 'casino', href: '/casino/roulette', players: 'Nhiều', icon: '◎', accent: '#16a34a', accent2: '#dc2626', badges: ['Chip ảo'] },
  { id: 'crash', name: 'Phi hành gia', tagline: 'Rút trước khi phi thuyền nổ', category: 'casino', href: '/casino/crash', players: 'Nhiều', icon: '🚀', accent: '#8b5cf6', accent2: '#ec4899', badges: ['Chip ảo', '3D'] },
  { id: 'dungeon', name: 'Dungeon ARPG', tagline: 'Đang làm, sẽ ra trên Steam', category: 'arcade', href: '#', players: '1–4', icon: '⚔', accent: '#64748b', accent2: '#a16207', comingSoon: true },
];

export const gameById = (id: string) => GAMES.find((g) => g.id === id);
