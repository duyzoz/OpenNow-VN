# OpenNOW-VN — Audit kiến trúc, hiệu năng và lộ trình cải tiến

## 1. Kết luận điều hành

OpenNOW-VN đã có nền tảng tốt cho một client cloud gaming thực tế: Electron + React/Vite được tách thành main, preload, renderer và shared contracts; WebRTC client có recovery; DOM input đã có batching/adaptive flush; NativeStreamer có protocol riêng, queue ICE, timeout và fallback về web streamer. Vì vậy hướng an toàn nhất không phải viết lại, mà là **giảm rerender, siết lifecycle, đo hiệu năng và bổ sung các lớp bảo vệ** quanh những phần đang phức tạp.

Ba rủi ro lớn nhất hiện tại là: **(1) tải renderer và GPU chưa được điều phối theo năng lực thiết bị; (2) lifecycle NativeStreamer/WebRTC có nhiều trạng thái giao nhau, dễ phát sinh session treo hoặc cleanup không hoàn toàn; (3) App/catalog state quá lớn, có nguy cơ thay đổi nhỏ làm render lan truyền hoặc request lại dữ liệu**.

Không nên thay protocol WebRTC/NativeStream hoặc thay toàn bộ hiệu ứng giao diện trong một lần. Mỗi thay đổi cần đi theo commit nhỏ, có feature flag hoặc đường rollback, và đo trước/sau.

## 2. Bản đồ kiến trúc đã kiểm tra

| Khu vực | Vai trò | Mức rủi ro | Nhận xét |
|---|---|---:|---|
| `src/main` | Electron main, IPC, session, signaling, NativeStreamer | Cao | Nhiều lifecycle bất đồng bộ, cần state machine và cleanup nghiêm ngặt |
| `src/preload` | Cầu nối renderer–main | Cao | Cần giữ API ổn định, giới hạn payload và tránh channel mở rộng tùy tiện |
| `src/renderer/src/App.tsx` | Điều phối toàn app | Cao | File lớn, nhiều state/effect/props nên dễ rerender lan truyền |
| `StreamView` | Video, input, cursor, overlay, stats | Rất cao | Đường nóng trong lúc chơi, mọi render thừa đều ảnh hưởng FPS/input latency |
| `webrtcClient.ts` | Peer connection, codec, recovery, stats | Rất cao | Không nên sửa sâu nếu chưa có test session/reconnect |
| `domInputCaptureController.ts` | Mouse, keyboard, pointer lock, batching | Rất cao | Đã có nền tảng tối ưu tốt; cần benchmark thay vì thay thuật toán |
| `nativeStreamer/manager.ts` | Process, protocol, ICE, surface, input | Rất cao | Có nguy cơ pending request và session race khi stop/reconnect |
| Catalog hooks/pages | Store, Library, Favorites, search | Trung bình–cao | Nguồn rerender/request lớn, nên tách query draft và committed query |
| `styles.css` | Toàn bộ UI | Trung bình–cao | Khoảng 265 KB, nhiều shadow/blur/backdrop/animation cần chế độ low-power |
| Native runtime | GStreamer/streaming backend | Rất cao | Cần telemetry stall và fallback rõ ràng, không tự động đổi backend quá tích cực |

## 3. Những gì đang tốt và nên giữ nguyên

- Batching mouse và adaptive flush tốt hơn gửi từng pointer event; không nên loại bỏ.
- Coalesced pointer events, residual quantization và backpressure đã thể hiện đúng hướng cho cloud gaming.
- NativeStreamer có timeout, stdout line buffer, stderr tail giới hạn, queue ICE và fallback.
- Surface update queue đã coalesce để chỉ gửi surface mới nhất, tránh gửi dồn resize.
- WebRTC có codec preference fallback và signaling recovery.
- Catalog đã có phân trang ở Library và cơ chế local autocomplete không chạm trực tiếp grid trong luồng mới.
- Luồng launch, favorite, filter và store action hiện có cần được bảo toàn.

## 4. Vấn đề cần sửa theo mức độ ưu tiên

### P0 — Ưu tiên rất cao, có thể ảnh hưởng trực tiếp đến session hoặc FPS

| Vấn đề | Tác động | Cách sửa đề xuất | Rủi ro |
|---|---|---|---|
| NativeStreamer stop đặt `child = null` trước khi child exit handler chạy | Các pending request khác có thể chỉ chờ timeout thay vì bị reject ngay; reconnect chậm và log khó hiểu | Trong `stop()`/`terminateProcess()`, reject pending requests theo generation trước khi kill; dùng process generation để bỏ qua event cũ | Thấp nếu thêm test |
| NativeStreamer start/stop liên tiếp có thể chồng startup promise hoặc process cũ | Có thể tạo hai đường lifecycle hoặc nhận event từ process cũ | Thêm `processGeneration`, `stoppingPromise` và assert một process active duy nhất | Trung bình |
| Renderer nhận stats/diagnostics quá thường xuyên | App/StreamView rerender, tốn CPU và gây drop frame | Tách stats store khỏi React tree; throttle UI 250–500 ms, giữ raw stats cho log/telemetry | Thấp–trung bình |
| Video shader/post-processing chạy trên máy yếu | GPU/CPU tăng, frame pacing xấu | Chế độ `Performance: Low/Auto/Quality`; mặc định low-power tắt shader/backdrop nặng | Thấp nếu có flag |
| Catalog `allKnownGames` ghép trùng từ nhiều nguồn | Search index lớn hơn cần thiết, duplicate result và tốn sort | Dedupe theo `game.id`, ưu tiên bản có image/variants đầy đủ; memoize index normalized | Thấp |
| Search/filter phải phân biệt draft query và committed query ở mọi page | Gõ phím có thể kích request hoặc reload grid | Chỉ gọi load API khi Enter/chọn suggestion/filter thay đổi; draft chỉ tác động dropdown | Thấp |

### P1 — Quan trọng, cải thiện độ ổn định và cảm nhận tốc độ

| Vấn đề | Đề xuất |
|---|---|
| WebRTC reconnect chưa có bảng trạng thái rõ ràng | Chuẩn hóa state machine: idle → connecting → negotiating → streaming → recovering → stopping → stopped; chặn transition ngược |
| ICE/offer cũ có thể đến sau session mới | Gắn session generation vào mọi offer/ICE/event; bỏ qua event không cùng generation |
| Video stall recovery có thể request keyframe quá dày | Cooldown theo session, exponential backoff nhẹ, giới hạn số lần trong một khoảng |
| `requestAnimationFrame`/timer nhiều vùng | Tạo lifecycle registry theo StreamView; unmount phải cancel toàn bộ RAF/interval/timeout |
| Cursor cache theo data URL/bitmap | Giới hạn LRU, dispose bitmap khi vượt ngưỡng hoặc đổi DPI nhiều lần |
| Log production quá nhiều | Logger theo level và ring buffer; không `console.log` mỗi stats tick/input event |
| AudioContext tạo/đóng lại nhiều lần | Reuse trong một session; chỉ reset track nodes khi đổi track |
| Request catalog thiếu cache TTL/in-flight dedupe | Cache theo user/proxy/filter/page; cùng request chỉ có một promise, request sau dùng kết quả |
| Ảnh game chưa có chiến lược lazy/priority | Chỉ ưu tiên ảnh viewport đầu, lazy load ảnh dưới fold; giữ aspect ratio để tránh layout shift |
| Library/Favorites vẫn render nhiều card ngoài viewport | Nếu profiling cho thấy >64 card, dùng windowing nhẹ hoặc pagination nhất quán |

### P2 — Tính năng nâng cao nên thêm sau khi ổn định

- Chế độ **Auto Performance** tự chọn hiệu ứng UI, shader, bitrate UI và số card theo CPU/GPU/RAM.
- Bảng điều khiển **Stream Health**: RTT, jitter, packet loss, decoded FPS, rendered FPS, dropped frames, bitrate, codec, resolution, input queue và native backend.
- Nút **Copy diagnostics** để người dùng gửi log an toàn đã lọc token/PII.
- **Quick Resume**: khôi phục session hợp lệ sau khi app restart, có timeout và nút bỏ qua.
- **Per-game profile**: store/variant, resolution, FPS, codec, bitrate cap, input mode và shader preference theo game.
- **Network presets**: Low latency, Balanced, Quality, Manual.
- **Input diagnostics**: hiển thị mouse packet rate, dropped non-critical events, pointer-lock state, stuck key guard.
- **Gamepad navigation hoàn chỉnh** cho search dropdown, filter, card và modal.
- **Offline catalog snapshot** có version/schema migration, stale indicator và retry nền.
- **Download/cache metadata** thay vì cache ảnh vô hạn trong memory.
- **Accessibility**: focus ring, ARIA combobox/listbox đúng chuẩn, reduced motion, high contrast và font scaling.
- **Multi-account/profile** với tách lịch sử, favorite và variant selection.
- **Import/export settings** dạng JSON đã validate schema.
- **Crash-safe session journal** để biết app chết ở giai đoạn launch/WebRTC/native nào.
- **Updater/rollback** chỉ khi dự án đã có chiến lược phát hành ổn định.

## 5. Tối ưu riêng cho WebRTC và NativeStream

### WebRTC

1. Thu thập `getStats()` theo chu kỳ 1–2 giây cho telemetry, nhưng chỉ đẩy snapshot đã throttle vào UI.
2. Dùng một session generation cho peer connection, signaling events, ICE candidates và recovery timer.
3. Khi đổi codec/resolution, phải chờ transition hoàn tất; không khởi tạo peer connection thứ hai nếu connection cũ chưa đóng.
4. Stall recovery cần cooldown và giới hạn retry; phân biệt stall do network, decoder, sink và native pipeline.
5. Giữ input channel ưu tiên: keyboard/button/release phải reliable; mouse movement có thể partially reliable/coalesced.
6. Không ghi log từng packet hoặc từng pointer event ở production.
7. Khi tab/window mất focus, pause input đúng cách và bảo đảm keyup được gửi khi resume/stop để chống stuck key.

### NativeStream

1. Thêm generation token cho process; event từ process cũ phải bị bỏ qua.
2. `stop()` cần reject pending requests trước hoặc trong quá trình kill, không chờ timeout.
3. Dùng một mutex/promise cho start và stop; không cho `ensureProcess()` khởi động process mới khi stop cũ chưa hoàn tất.
4. Gắn session ID vào mọi response/event quan trọng nếu protocol cho phép; nếu chưa đổi protocol, giữ mapping ở manager.
5. Giới hạn queue ICE theo số lượng và tuổi; xóa queue ngay khi session mismatch.
6. Throttle native stats/video-stall events trước khi gửi renderer.
7. Fallback native → WebRTC phải có lý do, cooldown và chống fallback loop.
8. Surface updates hiện đã coalesce; giữ nguyên cơ chế này và chỉ bổ sung generation check.
9. Input stdin đã có backpressure; cần metrics dropped non-critical packet và cảnh báo một lần/session.
10. Khi process exit, phát một event giàu thông tin: backend, exit code, stage, stderr tail, session ID, recovery attempt.

## 6. Tối ưu renderer và UI cho cả máy yếu/mạnh

### Chế độ Auto Performance

| Chế độ | Máy yếu | Máy mạnh |
|---|---|---|
| Card grid | Giới hạn card viewport + pagination | Giữ grid hiện tại, preload nhẹ |
| Blur/backdrop | Tắt hoặc giảm opacity | Giữ hiệu ứng hiện tại |
| Hover transform | Không đổi layout, transform nhẹ | Giữ hiệu ứng hiện tại |
| Shader video | Tắt mặc định | Cho phép theo setting |
| Stats UI | 500–1000 ms | 250–500 ms |
| Image loading | Lazy + decode tuần tự | Ưu tiên viewport + preload hàng kế |
| Catalog index | Memoized normalized index | Memoized index + worker nếu thật sự cần |

Không nên biến mọi thứ thành animation mới. Người dùng đã yêu cầu giữ hiệu ứng; vì vậy nên giảm tải bằng `prefers-reduced-motion`, low-power setting, giảm blur và tách overlay khỏi video path thay vì xóa giao diện.

### Rerender cần xử lý

- Tách `StreamView` thành các vùng có tần suất thay đổi khác nhau: video/input, controls, diagnostics, notifications.
- Stats không được nằm trong state khiến toàn App render lại.
- Dùng stable callback/props cho GameCard; tránh tạo object style/handler mới cho hàng trăm card mỗi render.
- Memoize `allKnownGames`, search index và normalized fields; dedupe theo ID.
- Khi gõ search, chỉ cập nhật dropdown state; grid query chỉ commit khi Enter/chọn game.
- Dùng `content-visibility: auto` có đo kiểm cho vùng catalog dài; không áp dụng mù lên StreamView/video.
- Lazy load modal/settings/gallery không nằm trên đường khởi động.

## 7. Tính năng nên thêm theo nhóm người dùng

### Người mới

- Onboarding kiểm tra GPU, WebRTC, microphone, gamepad, pointer lock và network.
- Nút test nhanh trước khi launch.
- Tooltip giải thích native/web streamer và fallback.

### Người dùng máy yếu

- Một nút “Tối ưu cho máy yếu”.
- Tắt blur/shader, giảm animation, giới hạn preload, giảm stats refresh.
- Hiển thị cảnh báo CPU/GPU thay vì để người dùng đoán.

### Người dùng máy mạnh

- Native backend preference, zero-copy status, HDR/VRR nếu thực sự khả dụng.
- Preset 120/144 FPS chỉ khi monitor và stream hỗ trợ.
- Profile per game và quality override.

### Người chơi cạnh tranh

- Input latency breakdown.
- Pointer lock status và raw input toggle.
- Network graph, jitter/packet loss, frame pacing.
- Hotkey bật/tắt diagnostics mà không mở modal.

### Cộng đồng mã nguồn mở

- `CONTRIBUTING.md`, architecture diagram, protocol versioning guide.
- Repro script cho WebRTC/native session.
- Unit test cho input packet ordering và NativeStreamer lifecycle.
- Benchmark script cho catalog 5k–10k game, render count và search latency.
- Redaction test để không log token/session secret.

## 8. Ma trận triển khai khuyến nghị

| Wave | Nội dung | Tác động | Nguy cơ | Cần benchmark |
|---|---|---:|---:|---:|
| Wave 0 | Baseline metrics, logger level, test harness | Cao | Thấp | Có |
| Wave 1 | Dedupe catalog, memoized search index, committed query, stats throttle | Rất cao | Thấp | Có |
| Wave 2 | NativeStreamer generation/stop cleanup, stale ICE guard, recovery cooldown | Rất cao | Trung bình | Có |
| Wave 3 | Auto Performance, low-power CSS/GPU gates, image loading | Cao | Trung bình | Có |
| Wave 4 | Stream Health panel, input diagnostics, crash-safe journal | Cao | Trung bình | Có |
| Wave 5 | Per-game profiles, network presets, quick resume, accessibility | Trung bình–cao | Trung bình | Có |
| Wave 6 | Native protocol extensions, zero-copy/HDR/VRR nâng cao | Cao | Cao | Bắt buộc |

## 9. Bộ benchmark cần bổ sung

- Catalog search: p50/p95 thời gian trả dropdown trên 5.000 và 10.000 game.
- Gõ liên tục: số lần render GameGrid, số request API, dropped frame count.
- Scroll: frame time p50/p95, long task >50 ms, memory sau 5 phút.
- Stream idle: CPU/GPU/RAM sau 10 phút với stats overlay bật/tắt.
- Input: packet rate, p95 input-to-send time, partially reliable drop count, key release integrity.
- Reconnect: thời gian từ disconnect đến first decoded frame; số process native đồng thời; pending request còn lại sau stop.
- Native: start time, hello time, offer-answer time, surface update count, stderr size.
- Memory: mở/đóng stream 20 lần, catalog page chuyển 50 lần, kiểm tra listener/RAF/timer còn sống.

## 10. Thứ tự thực hiện đề xuất

1. Thêm instrumentation nhẹ và benchmark baseline, không đổi behavior.
2. Dedupe/index catalog và bảo đảm draft search không gọi API/reload grid.
3. Tách stats khỏi render nóng của StreamView.
4. Siết NativeStreamer stop/start generation và pending cleanup.
5. Thêm low-power/auto-performance gates, giữ hiệu ứng mặc định.
6. Thêm Stream Health và input diagnostics sau khi dữ liệu đã đáng tin.
7. Chỉ sau đó mới làm protocol/native features lớn như zero-copy, HDR, VRR hoặc codec policy nâng cao.

## 11. Nguyên tắc không được phá

- Không đổi launch flow nếu chưa có test hồi quy.
- Không gửi từng mouse event và không chuyển reliable keyboard thành lossy.
- Không để search draft thay đổi grid/card list.
- Không xóa hiệu ứng đang có; chỉ giảm chi phí theo setting/performance mode.
- Không nâng dependency hàng loạt.
- Không log token, cookie, SDP nhạy cảm hoặc thông tin tài khoản.
- Mỗi wave một nhánh/commit rõ ràng, có thể rollback.
