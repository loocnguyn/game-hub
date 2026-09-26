// Short rule summaries shown on lobby pages.
export const RULES_TEXT: Record<string, string[]> = {
  chess: [
    'Luật cờ vua quốc tế đầy đủ: nhập thành, bắt tốt qua đường, phong cấp.',
    'Hòa khi hết nước đi (pat), lặp thế cờ 3 lần, 50 nước không ăn quân và không tốt nào đi, hoặc không đủ quân.',
    'Đồng hồ chỉ chạy sau khi cả hai bên đã đi nước đầu. Mỗi bên có 30 giây cho nước đầu, quá thì ván bị hủy.',
    'Hết giờ là thua, trừ khi đối thủ không đủ quân để chiếu hết thì hòa.',
    'Có thể đặt trước nước đi (premove) khi đang chờ đối thủ, và vẽ mũi tên bằng chuột phải.',
  ],
  xiangqi: [
    'Đỏ đi trước. Tướng và Sĩ không ra khỏi cung, Tượng không qua sông.',
    'Mã bị cản chân, Tượng bị cản mắt, Pháo phải có đúng một quân làm ngòi mới ăn được.',
    'Hai Tướng không được đối mặt trên cùng một cột trống.',
    'Bên hết nước đi là thua (kể cả khi không bị chiếu).',
    'Lặp thế cờ 3 lần: bên chiếu liên tục (chiếu dai) bị xử thua, còn lại là hòa. 60 nước không ăn quân thì hòa.',
  ],
  caro: [
    'X đi trước. Ai có 5 quân liền nhau theo hàng ngang, dọc hoặc chéo trước thì thắng.',
    'Luật chặn 2 đầu (tùy chọn): 5 quân bị đối thủ chặn ở cả hai đầu thì không tính.',
    'Bàn kín mà không ai thắng thì hòa.',
  ],
  dots: [
    'Mỗi lượt kẻ một đoạn nối hai điểm cạnh nhau.',
    'Ai kẻ đoạn khép kín một ô thì chiếm ô đó và được đi tiếp.',
    'Kẻ hết các đoạn thì ai chiếm nhiều ô hơn thắng.',
  ],
  tienlen: [
    '2–4 người, mỗi người 13 lá. Thứ tự từ nhỏ đến lớn: 3 → A → 2; chất: bích < chuồn < rô < cơ.',
    'Bộ đánh được: lẻ, đôi, sám (bộ ba), tứ quý, sảnh (từ 3 lá liên tiếp, không có 2), đôi thông (từ 3 đôi liên tiếp).',
    'Phải chặn bằng bộ cùng loại, cùng số lá và lớn hơn. Đã bỏ lượt thì không được đánh lại trong vòng đó.',
    'Chặt heo: 3 đôi thông hoặc tứ quý chặt được 1 heo; tứ quý hoặc 4 đôi thông chặt được đôi heo; tứ quý chặt 3 đôi thông; 4 đôi thông chặt tứ quý.',
    'Ván đầu người có 3 bích đi trước và phải đánh lá đó. Các ván sau người về nhất đi trước.',
    'Tới trắng khi vừa chia: tứ quý heo, sảnh rồng, 6 đôi, 5 đôi thông.',
    'Mỗi lượt có 30 giây, hết giờ thì tự bỏ lượt (hoặc tự đánh lá nhỏ nhất nếu đang đi trước).',
  ],
  monopoly: [
    '2–6 người. Đổ 2 xúc xắc để đi, đổ đôi được đổ tiếp, đổ đôi 3 lần liền thì vào tù.',
    'Đi vào ô chưa có chủ thì được mua. Vào ô người khác thì trả tiền thuê.',
    'Sở hữu cả nhóm màu thì tiền thuê gấp đôi và được xây nhà (xây đều), 4 nhà thì lên khách sạn.',
    'Có thể cầm cố đất để lấy tiền, chuộc lại mất thêm 10%.',
    'Vào tù: nộp 50, dùng thẻ ra tù, hoặc đổ đôi. Sau 3 lượt thì bắt buộc nộp phạt.',
    'Không đủ tiền trả thì phải bán nhà, cầm cố hoặc phá sản. Còn một người thì người đó thắng; hết giờ thì ai giàu nhất thắng.',
  ],
};
