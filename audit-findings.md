# OpenNOW-VN — Audit findings

## Phạm vi đã kiểm tra

Repository `duyzoz/OpenNow-VN`, ứng dụng Electron + React/Vite trong `opennow-stable`, gồm `src/main`, `src/preload`, `src/renderer`, `src/shared` và native streamer Rust bên ngoài thư mục source TypeScript.

## Kiến trúc sơ bộ

- Electron main process: `src/main`, gồm IPC, signaling, nativeStreamer, session, GFN platform, window, telemetry.
- Preload bridge: `src/preload/index.ts`.
- Renderer: `src/renderer/src`, gồm App, catalog pages, StreamView, GFN WebRTC, hooks và settings.
- Shared contracts: `src/shared/gfn`, `src/shared/platforms`, native streamer types.
- Native streamer runtime: `src/main/nativeStreamer` và native build script/Cargo manifest.

## Quy mô và hotspot

- `styles.css`: khoảng 264.9 KB.
- `App.tsx`: khoảng 110.1 KB.
- `webrtcClient.ts`: khoảng 87.4 KB.
- `domInputCaptureController.ts`: khoảng 57.5 KB.
- `LibraryPage.tsx`: khoảng 38.4 KB.
- `StreamView.tsx`: khoảng 31.1 KB.
- `nativeStreamer/manager.ts`: khoảng 27.3 KB.
- `useCatalogData.ts`: khoảng 25.8 KB.
- `cloudmatch.ts`: khoảng 25.6 KB.
- Có 219 lượt xuất hiện của listener/timer/RAF/WebSocket/RTCPeerConnection pattern.
- Có 257 pattern liên quan đến animation, filter/blur, contain, shadow, will-change hoặc Motion layout.
- Có 773 pattern console/catch/throw; cần phân loại, không nên xóa log mù vì stream debugging quan trọng.

## Giả thuyết ưu tiên cần xác minh

1. Renderer có nhiều hotspot lớn và CSS nặng; cần profiling thực tế trước khi đổi hiệu ứng.
2. WebRTC, DOM input capture và cursor channel là vùng rủi ro cao cho độ trễ input, reconnect và CPU.
3. NativeStreamer manager có trạng thái/phân luồng phức tạp; cần kiểm tra lifecycle process, ICE, video stall và cleanup.
4. App.tsx và catalog hooks có thể tạo rerender lan truyền khi session/catalog thay đổi; cần rà soát dependency arrays, context/props và selector granularity.
5. 219 listener/timer pattern cần audit cleanup và tần suất, đặc biệt trong stream view và signaling.
6. Cần giữ nguyên hành vi hiện có; mọi tối ưu nên có feature flag hoặc thay đổi nhỏ, kiểm thử typecheck/build/test trước khi commit.

## Quy tắc audit

- Không nâng dependency hàng loạt.
- Không thay đổi launch flow hoặc protocol nếu chưa có test/rollback.
- Ưu tiên đo trước/sau: render count, frame pacing, memory, CPU/GPU, WebRTC stats, input latency và reconnect time.
- Tách nhóm quick wins an toàn khỏi thay đổi NativeStream/WebRTC cần kiểm thử sâu.

## Phát hiện đã xác minh thêm

### Renderer và GPU

`styles.css` lớn khoảng 265 KB và có nhiều vùng dùng shadow, blur, backdrop-filter và animation. Đây không tự động là lỗi, nhưng các hiệu ứng cần được kiểm tra theo chế độ perf thấp, đặc biệt khi nhiều card/modal cùng hiện. Ứng dụng đã có phân trang catalog 64 card ở một số trang và prompt phát hiện thiết bị yếu, nhưng chưa đủ cơ sở kết luận mọi trang đều virtualize; cần kiểm tra thực tế render count và scroll frame time.

`StreamView` có listener video được cleanup đúng ở vùng đã đọc. Video shader là một đường GPU-heavy cần feature gate rõ ràng: mặc định không nên chạy post-processing nếu người dùng chọn Native/low power hoặc GPU không đủ.

### WebRTC và input

`domInputCaptureController.ts` đã có batching, coalesced pointer events, pointerrawupdate fallback, residual quantization, adaptive flush và cleanup timer/listener. Đây là nền tảng tốt, vì vậy không nên thay bằng gửi từng mouse event. Rủi ro cần xác minh bằng benchmark là adaptive flush có thể thay đổi latency theo tải, mixed absolute+relative packet phải giữ thứ tự reliable, và pointerrawupdate stuck fallback có thể để lại interval 0 nếu không reset đúng khi session mới.

Cursor overlay có cache hình cursor và listener resize được dispose. Cần kiểm tra giới hạn cache/giải phóng image bitmap và thay đổi DPI/resolution dài phiên.

### NativeStreamer và signaling

NativeStreamer dùng request timeout, pending request map, stdout line buffer, queue ICE trước/sau answer, fallback sang web streamer khi native thất bại và stop khi signaling disconnect. Đây là đường lifecycle phức tạp nhưng có fallback tốt. Các điểm nên ưu tiên test là: stop/reconnect liên tiếp, pending request reject khi process exit, stderr tail bị giới hạn, duplicate offer/ICE, và native fallback không phát sinh hai streamer cùng lúc.

### IPC và state

`App.tsx` lớn khoảng 110 KB, chứa nhiều state/callback/effect và truyền dữ liệu xuống nhiều trang. `allKnownGames` hiện được ghép từ catalog, library và store panels; cần deduplicate theo `game.id` trước khi index/search để giảm công việc và tránh kết quả trùng. Diagnostics và signaling events có thể cập nhật store thường xuyên; UI nên dùng selector/throttle theo nhóm thay vì làm toàn App rerender.

### Input hiện có

Gamepad navigation dùng `requestAnimationFrame` nhưng có guard/cancel khi dừng ở vùng đã đọc. Cần tiếp tục kiểm tra các trang khác và đảm bảo không có nhiều RAF loop cùng lúc khi chuyển page.

## Streaming baseline đã xác minh

### WebRTC

`webrtcClient.ts` đang poll `RTCPeerConnection.getStats()` mỗi 500 ms, có guard chống poll chồng. Đã thu thập bitrate, packet loss theo delta, frames received/decoded/dropped, decode FPS, jitter, average jitter-buffer delay, codec/HDR, resolution, decode time, inter-frame delay, RTT, input queue/backpressure và mouse flush diagnostics. Decoder pressure controller đã được gọi sau mỗi sample và có lag classification.

Đây là baseline telemetry tốt, nhưng `emitStats()` cần được kiểm tra xem có đẩy toàn bộ snapshot vào React mỗi 500 ms hay không. Hướng tối ưu là giữ raw sample cho controller/recovery, còn UI chỉ nhận snapshot throttle 250–1000 ms tùy chế độ; tuyệt đối không giảm tần suất dữ liệu dùng cho recovery nếu không đo rõ.

`collectStats()` cũng đang điều chỉnh adaptive mouse flush trong cùng chu kỳ stats. Cần tách đường điều khiển input khỏi UI stats, thêm hysteresis/cooldown để tránh interval mouse dao động khi buffer quanh ngưỡng.

### NativeStream

`NativeStreamerManager` có surface queue coalescing và backpressure stdin. Tuy nhiên `stop()` gọi request stop rồi `terminateProcess()`, trong khi `terminateProcess()` đặt `this.child = null` trước khi process phát exit. Vì `handleProcessExit()` thoát sớm khi `this.child` đã null, các pending request khác có thể không bị reject ngay mà chờ timeout. Đây là ứng viên sửa P0 có thể cải thiện reconnect/stop latency mà không đổi protocol.

Process event đã có error/exit handler, stderr tail giới hạn và reject pending trong `handleProcessExit()`. Cần thêm process generation để event từ process cũ không ảnh hưởng session mới, và đảm bảo start/stop không chồng process.

### Đường ưu tiên tối ưu

1. Đo/đưa ra UI riêng cho raw-vs-display stats.
2. Sửa stop/pending cleanup và process generation NativeStreamer.
3. Throttle stats UI, không throttle controller.
4. Thêm hysteresis cho decoder pressure và adaptive mouse flush.
5. Bổ sung frame pacing signal từ `requestVideoFrameCallback`/video track nếu có, tách decoded FPS khỏi rendered FPS.
6. Sau đó mới tinh chỉnh jitter buffer/bitrate/recovery policy.

## External validation — GStreamer NativeStream data-channel backpressure (2026-08-13)

- Official GStreamer `GstWebRTCDataChannel` documentation confirms the `buffered-amount-low` signal, the `buffered-amount-low-threshold` property, and that `send_data_full` succeeds once a message has been queued: https://gstreamer.freedesktop.org/documentation/webrtclib/gstwebrtc-datachannel.html
- Rust `gstreamer-webrtc` documentation confirms the binding exposes `buffered_amount()`, `buffered_amount_low_threshold()`, `set_buffered_amount_low_threshold()`, and `connect_on_buffered_amount_low()`: https://docs.rs/gstreamer-webrtc/latest/gstreamer_webrtc/struct.WebRTCDataChannel.html
- Commit `6c7a11c` uses those APIs only for the NativeStream raw-mouse fast path: over 32 KiB retain the newest movement, flush at the 16 KiB low-watermark, and send any movement immediately before click/key/wheel over the ordered reliable channel.
