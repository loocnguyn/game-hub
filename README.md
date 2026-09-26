# Neon Arcade

Sảnh game cho nhóm bạn: đăng nhập một lần, chơi nhiều game.

| Game | Kiểu | Ghi chú |
|---|---|---|
| Tetris Neon | Solo + 1v1 | Vô tận có bảng xếp hạng (điểm được server chạy lại để kiểm tra), 1v1 tính giờ / hạ gục, 3D hoặc 2D |
| Cờ vua | Online 2 người | Đồng hồ kiểu chess.com/lichess, premove, rating Glicko-2, bàn 3D |
| Cờ tướng | Online 2 người | Đủ luật, chiếu dai xử thua, ký hiệu kiểu Việt Nam |
| Caro | Online 2 người | 15×15 / 20×20, tùy chọn chặn 2 đầu |
| Dots and Boxes | Online 2 người | 3×3 → 6×6 |
| Tiến lên miền Nam | Online 2–4 người | Chặt heo, tứ quý, đôi thông, tới trắng |
| Cờ tỉ phú | Online 2–6 người | Bàn cờ các tỉnh thành VN, xây nhà, cầm cố, đổi chác |
| Dò mìn, 2048, Sudoku | Solo | Bảng xếp hạng, kiểm tra kết quả trên server |
| Sicbo, Roulette, Phi hành gia | Casino chip ảo | Kết quả provably fair (công bố hash seed trước ván) |
| Royal Poker | Online | App cũ, chạy ở `/poker`, dùng chung đăng nhập |

## Kiến trúc

- **Next.js 16 + React 19 + Tailwind 4** (thư mục `src/`), 3D bằng React Three Fiber.
- **Supabase** (project dùng chung với Royal Poker): Auth, Postgres (RLS), Realtime.
- **Edge Function `hub`** (`supabase/functions/hub`) là API duy nhất cho mọi thao tác ghi. Mọi luật chơi nằm trong
  `supabase/functions/_shared/*` và được dùng chung giữa trình duyệt và server (server là trọng tài).
- Phòng chơi lưu ở `hub_rooms` (công khai) và `hub_room_private` (bài trên tay, seed — chỉ server đọc được).
  Mỗi lần ghi dùng optimistic lock (`version`).

## Chạy local

```bash
npm install
npm run dev
```

## Test

```bash
npm test            # 300 unit test cho mọi engine luật chơi
npm run test:api    # integration test gọi API thật trên Supabase (tạo tài khoản test)
npx playwright test # e2e trên trình duyệt (dùng Microsoft Edge có sẵn)
npm run typecheck
```

## Deploy

- Database: các file trong `supabase/migrations/` (003 → 005).
- Edge function: `npx supabase functions deploy hub --no-verify-jwt --project-ref fedhavhjkmsweyhsxkkk`
  (hoặc `npm run bundle:fn` để gộp thành một file `.tmp/hub.bundle.js`).
- Web: deploy thư mục gốc lên Vercel như một app Next.js bình thường.
