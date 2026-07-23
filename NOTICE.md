# Thông báo nguồn dữ liệu

## Mã nguồn

Vĩnh Long Layer Atlas được phát triển bởi **Long Ngo** và phát hành theo giấy phép MIT.
Các thư viện bên thứ ba giữ nguyên giấy phép riêng:

- MapLibre GL JS — BSD 3-Clause
- PMTiles JavaScript — BSD 3-Clause
- Tippecanoe — BSD 2-Clause
- VersaTiles — MIT
- Lucide Icons — ISC

## Dữ liệu

Dữ liệu chuyên đề trong thư mục `data/geojson/` được trích xuất từ gói dữ liệu có khai báo
nguồn `https://hatang.vinhlong.gov.vn/`. Gói ZIP ban đầu thiếu central directory; 103 tệp
GeoJSON hoàn chỉnh được khôi phục theo local header, kích thước và CRC-32.

Giấy phép MIT trong repository chỉ áp dụng cho mã nguồn do dự án phát triển. Người sử dụng
dữ liệu cần tự xác minh điều khoản của đơn vị cung cấp, độ chính xác, tính cập nhật, quyền riêng tư
và nghĩa vụ ghi công trước khi dùng trong hoạt động nghiệp vụ hoặc ra quyết định.
