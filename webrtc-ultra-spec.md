# WebRTC Ultra — implementation contract

## Mục tiêu

WebRTC Ultra là WebRTC-only path của OpenNow-VN. Ultra không đổi server transport contract trong wave đầu; nó hợp nhất và làm cứng các tối ưu đã có trong WebRTC client, loại bỏ nhánh `isNativeInputActive` khỏi runtime sau khi NativeStream được xóa.

## So với WebRTC hiện tại

| Hạng mục | WebRTC hiện tại | WebRTC Ultra |
|---|---|---|
| Video | Chromium WebRTC + hardware decode | Giữ nguyên nền tảng, thêm live-edge guard, không render frame stale, adaptive profile chỉ khi có số liệu |
| Mouse | `pointerrawupdate` nếu có, 4 ms flush, partial-reliable khi server cho phép | Giữ 4 ms raw path làm mặc định; không hạ xuống 1 ms vì 1000 Hz không đồng nghĩa cần 1000 packet/s; thêm tuổi batch p50/p95, hard stale cutoff và bảo đảm action flush trước click/key |
| Queue | 32 KB PR buffer, 16 KB low watermark | Mouse motion chỉ giữ mẫu mới nhất khi queue cao; click/key/gamepad không bao giờ bị drop; queue target gần 0 KB sau flush |
| Pointer lock | Có raw/unadjusted movement, fallback accelerated | Không native capture; Escape, blur, Quick Menu và `pointerlockchange` luôn release/reset an toàn |
| Input routing | Có nhánh native bridge trong controller/policy | Chỉ một WebRTC input path, bỏ branch native nhưng giữ reliable/partial-reliable semantics |
| Telemetry | RTT, jitter, decode, queue, mouse batch age | Thêm rõ `transport=webrtc-ultra`, input p50/p95, stale-motion drops, pointer-lock state, frames pending/dropped và decode-to-present |
| Packaging | Có native helper/GStreamer extraResources | Không build hoặc bundle Rust/GStreamer/native streamer |

## Mouse contract

`pointerrawupdate` được dùng khi Chromium hỗ trợ; `pointermove` + coalesced events là fallback. Deltas được tích lũy theo float rồi lượng tử hóa với residual để không mất chuyển động nhỏ. Flush target là 4 ms khi raw event có mặt, 8 ms khi chỉ có coalesced pointer events và 16 ms ở fallback an toàn.

Không gửi một packet cho mỗi event 1000 Hz. Điều đó chỉ làm tăng overhead và tạo queue; thay vào đó, mọi delta trong cửa sổ 4 ms được gộp, giữ tổng delta chính xác. Khi `bufferedAmount` vượt 32 KiB, chỉ mẫu chuyển động mới nhất được giữ. Khi queue xuống dưới 16 KiB, mẫu mới nhất được flush. Mouse absolute + relative trong cùng batch đi qua reliable ordered channel để giữ thứ tự.

Mọi keyboard/click/gamepad action gọi `sendReliableSingleInput`, hàm này flush pending mouse trước khi gửi action. Đây là invariant bắt buộc để click không đi trước chuyển động cuối cùng.

## Video contract

Dùng một video element và Chromium hardware decode. Không thêm canvas copy, CPU frame conversion hoặc React state update theo từng frame. `requestVideoFrameCallback` phải có generation guard. Renderer phải ưu tiên frame mới nhất; không tự tạo queue frame trong JavaScript.

Adaptive policy chỉ được thay đổi profile khi telemetry vượt ngưỡng trong một cửa sổ ổn định, tránh oscillation. Mốc chẩn đoán:

| Chỉ số | Mục tiêu client |
|---|---:|
| Mouse batch age p50 | <= 4 ms |
| Mouse batch age p95 | <= 12 ms |
| PR input queue steady-state | <= 4 KiB |
| Reliable input queue | 0 hoặc gần 0 |
| Scheduling delay p95 | <= 4 ms |
| Client frames pending | 0–1 |
| Client render FPS | gần caps FPS |
| Decode-to-present | ổn định, không tăng dần theo thời gian |

Các ngưỡng trên là mục tiêu phía client, không phải cam kết RTT tới server. Với RTT khoảng 217 ms, Ultra không thể loại bỏ propagation/network delay; nó chỉ bảo đảm client không cộng thêm queue/capture/decode delay.

## Xóa NativeStream

Xóa theo thứ tự: (1) WebRTC-only runtime flag và main signaling branches; (2) renderer/native settings and callbacks; (3) package scripts/extraResources; (4) shared native contracts; (5) native TS modules/tests; (6) Rust/GStreamer source and binaries. Mỗi bước phải typecheck/build/test trước khi sang bước tiếp theo.

Không xóa `src/renderer/src/platforms/gfn/webrtc/*`, input protocol, StreamView, stream diagnostics hoặc common signaling nếu chúng còn phục vụ WebRTC Ultra.
