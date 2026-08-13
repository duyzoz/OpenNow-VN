# Nghiên cứu kiến trúc streaming thay NativeStream

## Nguồn chính thức

1. W3C WebTransport: https://www.w3.org/TR/webtransport/
   - Trạng thái trên trang: Candidate Recommendation Snapshot ngày 30/07/2026; chưa phải Recommendation cuối.
   - WebTransport chạy trên HTTP/3/QUIC và cung cấp session, reliable streams, bidirectional/unidirectional streams, cùng unreliable datagrams.
   - Reliable stream giữ thứ tự và độ tin cậy nhưng có thể chậm hơn datagram; datagram không đảm bảo đến nơi hoặc đúng thứ tự, phù hợp dữ liệu mới nhất thay thế dữ liệu cũ.
   - Có các thống kê connection/datagram/stream và cơ chế high-water/maximum age trong API mới, hữu ích cho telemetry/drop policy.
   - WebTransport yêu cầu secure context (HTTPS), server HTTP/3/QUIC tương thích và fallback khi mạng/proxy không hỗ trợ.

2. MDN WebTransport API: https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API
   - WebTransport là API low-level qua HTTP/3, hỗ trợ multiple streams, out-of-order delivery, reliable streams và UDP-like unreliable datagrams.
   - Datagrams không đảm bảo delivery/order; streams đảm bảo delivery/order và có thể đặt priority.
   - API dùng được trong Web Workers; phải chạy trong secure context.

3. W3C WebCodecs: https://www.w3.org/TR/webcodecs/
   - VideoDecoder/EncodedVideoChunk/VideoFrame cho phép ứng dụng tự điều khiển pipeline codec.
   - Codec xử lý qua control queue và work queue; decodeQueueSize thể hiện backlog.
   - WebCodecs là Working Draft, không tự bảo đảm codec/hardware support đồng nhất; cần isConfigSupported và runtime fallback.
   - VideoFrame/resource phải release sớm để tránh cạn GPU/CPU resources.

4. RFC 8834 RTP/WebRTC: https://www.rfc-editor.org/info/rfc8834
   - WebRTC dùng RTP và RTCP cho media; RTCP/congestion control/feedback là phần nền tảng giúp thích nghi mạng và theo dõi packet loss/jitter.
   - WebRTC có sẵn ICE/STUN/TURN, media transport và data transport trong một hệ sinh thái đã trưởng thành.

5. W3C WebRTC-PC: https://w3c.github.io/webrtc-pc/
   - RTCPeerConnection hỗ trợ ICE/STUN/TURN, media tracks và arbitrary data trực tiếp.
   - Data channels dựa trên SCTP/DTLS/UDP và có thể cấu hình reliable/unreliable.

6. MDN RTCDataChannel maxRetransmits: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/maxRetransmits
   - maxRetransmits giới hạn số lần retransmit; null nghĩa là không giới hạn.

7. MDN WebTransportDatagramDuplexStream: https://developer.mozilla.org/en-US/docs/Web/API/WebTransportDatagramDuplexStream
   - Datagram stream có maxDatagramSize, incoming/outgoing high-water mark và incoming/outgoing max age; các trường này hữu ích để giữ live-edge, tránh queue tích lũy.

## Ghi chú dự án

- OpenNow-VN hiện dùng Electron ^43.1.1, đã có WebRTC video/data/input và signaling; NativeStream là nhánh Electron main -> Rust/GStreamer -> NVST/UDP/decoder/input capture.
- NativeStream hiện gặp lỗi capture/shortcut và hình mờ/lag; WebRTC đã có telemetry và thực tế ổn định hơn theo test người dùng.
- Nền tảng thay thế khả thi nhất cần tái sử dụng signaling/session/input/telemetry hiện có, không được buộc user đổi server ngay.

## Kết luận sau khi mở trực tiếp tài liệu W3C

W3C WebTransport hiện hiển thị Candidate Recommendation Snapshot (30/07/2026), chưa phải Recommendation cuối. Nó hỗ trợ streams đáng tin cậy và datagrams không đảm bảo thứ tự, nhưng một sản phẩm game-streaming phải tự định nghĩa framing, keyframe recovery, loss/drop policy, authentication, server HTTP/3 và fallback. Đây là nền tảng hứa hẹn cho giao thức mới nhưng chưa phải đường thay thế tức thời ít rủi ro.

W3C WebCodecs hiện hiển thị Working Draft (08/07/2026). Nó cho phép tự điều khiển VideoDecoder, kiểm soát decode queue và latency mode, nhưng không bảo đảm mọi codec hoặc hardware path giống nhau; cần runtime capability check và release VideoFrame sớm. Vì vậy WebCodecs có thể là decoder/presentation layer của OpenNow QUIC, nhưng không nên là fallback duy nhất ở giai đoạn đầu.

W3C WebRTC hiện có Editor's Draft và implementation report/test suite; nền tảng đã bao gồm ICE/STUN/TURN, media tracks và arbitrary data. Đây là lý do WebRTC-first vẫn là đường ổn định nhất để phục vụ người dùng ngay, dù có thể tối ưu thêm congestion/input/presentation.

## Phương án bổ sung

Sunshine là host streaming chuyên dụng cho Moonlight, hỗ trợ low-latency cloud gaming và hardware encoding cho AMD, Intel, NVIDIA trên Windows/Linux/macOS theo bảng tương thích của tài liệu. Đây là bằng chứng rằng giao thức game-streaming native chuyên dụng có thể rất tốt, nhưng Sunshine/Moonlight là một hệ sinh thái host/client riêng; nhúng nó vào OpenNow-VN sẽ đòi hỏi tích hợp pairing, control, codec, input và client native, không phải thay một file Rust nhỏ.

RTP over QUIC (RoQ) trên IETF Datatracker hiện là Internet-Draft đã expired/archived, bản -14; trạng thái IESG là Expired. Vì vậy không nên chọn RoQ làm nền giao thức production mới lúc này. Có thể tham khảo ý tưởng RTP framing/feedback, nhưng không nên khóa OpenNow-VN vào bản nháp này.

SRT là hướng live-video có độ trễ thấp nhưng thiên về truyền broadcast/resilient video với retransmission và latency buffer; không phù hợp làm mặc định cho game control cực nhạy nếu mục tiêu là giữ live-edge vài frame. Nó chỉ đáng cân nhắc cho fallback chất lượng/đường mạng xấu, không phải replacement ưu tiên.
