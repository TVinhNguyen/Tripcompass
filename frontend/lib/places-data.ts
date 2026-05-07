export type PlaceType = "food" | "attraction" | "accommodation" | "transport" | "activity"

export interface Place {
  id: string
  name: string
  type: PlaceType
  city: string
  address: string
  lat?: number
  lng?: number
  priceAvg?: number
  rating?: number
  reviewCount?: number
  images: string[]
  description?: string
  tags: string[]
  openingHours?: string
}

export interface Combo {
  id: string
  title: string
  destination: string
  days: number
  totalCost: number
  coverImage: string
  description: string
  placeCount: number
  tags: string[]
  rating?: number
}

export const placeTypeLabels: Record<PlaceType, string> = {
  food: "Ẩm thực",
  attraction: "Tham quan",
  accommodation: "Lưu trú",
  transport: "Di chuyển",
  activity: "Hoạt động",
}

export const cities = [
  "Hà Nội",
  "Đà Nẵng",
  "Hội An",
  "Huế",
  "TP. Hồ Chí Minh",
  "Đà Lạt",
  "Nha Trang",
  "Sapa",
  "Phú Quốc",
  "Hạ Long",
]

export const places: Place[] = [
  {
    id: "p1",
    name: "Phở Bát Đàn",
    type: "food",
    city: "Hà Nội",
    address: "49 Bát Đàn, Hoàn Kiếm, Hà Nội",
    lat: 21.0353,
    lng: 105.8472,
    priceAvg: 50000,
    rating: 4.6,
    reviewCount: 1234,
    images: [
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800",
      "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800",
    ],
    description:
      "Quán phở gia truyền nổi tiếng bậc nhất Hà Nội với nước dùng trong vắt, thịt bò tươi ngon và bánh phở mềm mại. Không gian giản dị nhưng luôn đông khách.",
    tags: ["phở", "truyền thống", "sáng sớm", "đặc sản"],
    openingHours: "06:00 - 10:30",
  },
  {
    id: "p2",
    name: "Hồ Hoàn Kiếm",
    type: "attraction",
    city: "Hà Nội",
    address: "Hoàn Kiếm, Hà Nội",
    lat: 21.0287,
    lng: 105.8524,
    priceAvg: 0,
    rating: 4.7,
    reviewCount: 5678,
    images: [
      "https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?w=800",
      "https://images.unsplash.com/photo-1528181304800-259b08848526?w=800",
    ],
    description:
      "Trái tim của thủ đô Hà Nội với truyền thuyết Rùa Vàng. Dạo quanh hồ, ghé Đền Ngọc Sơn và cầu Thê Húc đỏ rực biểu tượng.",
    tags: ["biểu tượng", "miễn phí", "lịch sử", "chụp ảnh"],
    openingHours: "Cả ngày",
  },
  {
    id: "p3",
    name: "Bà Nà Hills",
    type: "attraction",
    city: "Đà Nẵng",
    address: "An Sơn, Hoà Ninh, Hoà Vang, Đà Nẵng",
    lat: 15.9977,
    lng: 107.9882,
    priceAvg: 900000,
    rating: 4.5,
    reviewCount: 3421,
    images: [
      "https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800",
      "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800",
    ],
    description:
      "Khu du lịch nổi tiếng với Cầu Vàng, làng Pháp cổ kính và hệ thống cáp treo dài nhất thế giới. Khí hậu mát mẻ quanh năm.",
    tags: ["cáp treo", "cầu vàng", "châu âu", "gia đình"],
    openingHours: "07:00 - 22:00",
  },
  {
    id: "p4",
    name: "InterContinental Danang Sun Peninsula",
    type: "accommodation",
    city: "Đà Nẵng",
    address: "Bãi Bắc, Sơn Trà, Đà Nẵng",
    priceAvg: 8500000,
    rating: 4.9,
    reviewCount: 876,
    images: [
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800",
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800",
    ],
    description:
      "Resort 5 sao sang trọng nằm trên bán đảo Sơn Trà với thiết kế độc đáo của kiến trúc sư Bill Bensley, hồ bơi vô cực và bãi biển riêng.",
    tags: ["5 sao", "resort", "bãi biển", "sang trọng"],
    openingHours: "Cả ngày",
  },
  {
    id: "p5",
    name: "Phố cổ Hội An",
    type: "attraction",
    city: "Hội An",
    address: "Minh An, Hội An, Quảng Nam",
    lat: 15.8801,
    lng: 108.338,
    priceAvg: 120000,
    rating: 4.8,
    reviewCount: 9876,
    images: [
      "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800",
      "https://images.unsplash.com/photo-1528127269322-539801943592?w=800",
    ],
    description:
      "Di sản văn hoá thế giới UNESCO với kiến trúc cổ độc đáo. Đặc biệt lung linh khi đèn lồng thắp sáng vào buổi tối và đêm rằm.",
    tags: ["unesco", "đèn lồng", "phố cổ", "chụp ảnh"],
    openingHours: "Cả ngày",
  },
  {
    id: "p6",
    name: "Bánh mì Phượng",
    type: "food",
    city: "Hội An",
    address: "2B Phan Châu Trinh, Hội An",
    priceAvg: 35000,
    rating: 4.7,
    reviewCount: 4567,
    images: [
      "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800",
      "https://images.unsplash.com/photo-1509722747041-616f39b57569?w=800",
    ],
    description:
      "Được Anthony Bourdain ca ngợi là 'Bánh mì ngon nhất thế giới'. Nhân đa dạng với pate, thịt nguội, rau thơm tươi.",
    tags: ["bánh mì", "anthony bourdain", "đường phố", "must-try"],
    openingHours: "06:30 - 21:30",
  },
  {
    id: "p7",
    name: "Quảng trường Lâm Viên",
    type: "attraction",
    city: "Đà Lạt",
    address: "Trần Quốc Toản, Đà Lạt",
    priceAvg: 0,
    rating: 4.4,
    reviewCount: 2134,
    images: [
      "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800",
      "https://images.unsplash.com/photo-1528181304800-259b08848526?w=800",
    ],
    description:
      "Trung tâm của thành phố ngàn hoa với hoa atiso khổng lồ. Điểm check-in nổi tiếng với tầm nhìn ra Hồ Xuân Hương thơ mộng.",
    tags: ["miễn phí", "chụp ảnh", "trung tâm", "view đẹp"],
    openingHours: "Cả ngày",
  },
  {
    id: "p8",
    name: "Nem nướng Bà Hùng",
    type: "food",
    city: "Đà Lạt",
    address: "328 Phan Đình Phùng, Đà Lạt",
    priceAvg: 60000,
    rating: 4.5,
    reviewCount: 1987,
    images: [
      "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=800",
      "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800",
    ],
    description:
      "Đặc sản Đà Lạt với nem nướng thơm lừng, cuốn bánh tráng kèm rau sống và nước chấm đậm đà đặc trưng.",
    tags: ["đặc sản", "nem nướng", "bình dân", "local"],
    openingHours: "14:00 - 22:00",
  },
  {
    id: "p9",
    name: "Vịnh Hạ Long Cruise",
    type: "activity",
    city: "Hạ Long",
    address: "Bãi Cháy, Hạ Long, Quảng Ninh",
    priceAvg: 2500000,
    rating: 4.8,
    reviewCount: 3456,
    images: [
      "https://images.unsplash.com/photo-1528127269322-539801943592?w=800",
      "https://images.unsplash.com/photo-1528181304800-259b08848526?w=800",
    ],
    description:
      "Du thuyền qua đêm khám phá kỳ quan thiên nhiên thế giới. Thăm hang động, chèo kayak và ngắm hoàng hôn trên vịnh.",
    tags: ["du thuyền", "unesco", "qua đêm", "kỳ quan"],
    openingHours: "Khởi hành 12:00",
  },
  {
    id: "p10",
    name: "Ruộng bậc thang Sapa",
    type: "attraction",
    city: "Sapa",
    address: "Mường Hoa, Sapa, Lào Cai",
    priceAvg: 150000,
    rating: 4.9,
    reviewCount: 2876,
    images: [
      "https://images.unsplash.com/photo-1570366583862-f91883984fde?w=800",
      "https://images.unsplash.com/photo-1528127269322-539801943592?w=800",
    ],
    description:
      "Ruộng bậc thang kỳ vĩ của đồng bào dân tộc, đẹp nhất vào mùa lúa chín tháng 9-10. Trekking qua các bản làng truyền thống.",
    tags: ["trekking", "ruộng bậc thang", "văn hoá", "thiên nhiên"],
    openingHours: "Cả ngày",
  },
  {
    id: "p11",
    name: "Bãi Sao Phú Quốc",
    type: "attraction",
    city: "Phú Quốc",
    address: "An Thới, Phú Quốc, Kiên Giang",
    priceAvg: 0,
    rating: 4.7,
    reviewCount: 4123,
    images: [
      "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
    ],
    description:
      "Một trong những bãi biển đẹp nhất Việt Nam với cát trắng mịn và nước biển xanh trong. Lý tưởng cho tắm biển và nghỉ dưỡng.",
    tags: ["bãi biển", "cát trắng", "miễn phí", "thiên nhiên"],
    openingHours: "Cả ngày",
  },
  {
    id: "p12",
    name: "VinWonders Nha Trang",
    type: "activity",
    city: "Nha Trang",
    address: "Đảo Hòn Tre, Nha Trang",
    priceAvg: 750000,
    rating: 4.6,
    reviewCount: 5432,
    images: [
      "https://images.unsplash.com/photo-1573790387438-4da905039392?w=800",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
    ],
    description:
      "Công viên giải trí hàng đầu Đông Nam Á với cáp treo dài nhất và các trò chơi đỉnh cao dành cho cả gia đình.",
    tags: ["công viên", "cáp treo", "gia đình", "giải trí"],
    openingHours: "08:30 - 21:00",
  },
]

export const combos: Combo[] = [
  {
    id: "c1",
    title: "Hà Nội khám phá trọn gói 4 ngày",
    destination: "Hà Nội",
    days: 4,
    totalCost: 4500000,
    coverImage: "https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?w=800",
    description:
      "Gói trải nghiệm đầy đủ văn hoá, ẩm thực và di tích nổi bật của thủ đô ngàn năm văn hiến.",
    placeCount: 12,
    tags: ["văn hoá", "ẩm thực", "lịch sử"],
    rating: 4.8,
  },
  {
    id: "c2",
    title: "Đà Nẵng - Hội An 5 ngày trọn vẹn",
    destination: "Đà Nẵng",
    days: 5,
    totalCost: 8900000,
    coverImage: "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800",
    description:
      "Bà Nà Hills, biển Mỹ Khê, phố cổ Hội An và ẩm thực miền Trung. Gói hoàn hảo cho chuyến đi đáng nhớ.",
    placeCount: 15,
    tags: ["biển", "di sản", "cáp treo"],
    rating: 4.9,
  },
  {
    id: "c3",
    title: "Đà Lạt lãng mạn 3 ngày 2 đêm",
    destination: "Đà Lạt",
    days: 3,
    totalCost: 3200000,
    coverImage: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800",
    description:
      "Thành phố ngàn hoa với không khí mát lạnh, những đồi cà phê và điểm check-in đẹp như mơ.",
    placeCount: 10,
    tags: ["lãng mạn", "thiên nhiên", "hoa"],
    rating: 4.7,
  },
  {
    id: "c4",
    title: "Phú Quốc nghỉ dưỡng 5 ngày",
    destination: "Phú Quốc",
    days: 5,
    totalCost: 12500000,
    coverImage: "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800",
    description:
      "Resort 5 sao, bãi biển hoang sơ, lặn ngắm san hô và hoàng hôn tuyệt đẹp trên đảo ngọc.",
    placeCount: 14,
    tags: ["cao cấp", "biển", "nghỉ dưỡng"],
    rating: 4.9,
  },
  {
    id: "c5",
    title: "Sapa trekking 3 ngày",
    destination: "Sapa",
    days: 3,
    totalCost: 2800000,
    coverImage: "https://images.unsplash.com/photo-1570366583862-f91883984fde?w=800",
    description:
      "Khám phá ruộng bậc thang, các bản làng dân tộc và đỉnh Fansipan – nóc nhà Đông Dương.",
    placeCount: 9,
    tags: ["trekking", "dân tộc", "núi"],
    rating: 4.8,
  },
  {
    id: "c6",
    title: "Vịnh Hạ Long du thuyền 2 ngày",
    destination: "Hạ Long",
    days: 2,
    totalCost: 5500000,
    coverImage: "https://images.unsplash.com/photo-1528127269322-539801943592?w=800",
    description:
      "Du thuyền qua đêm trên kỳ quan UNESCO, khám phá hang động và chèo kayak giữa vịnh.",
    placeCount: 8,
    tags: ["du thuyền", "kỳ quan", "unesco"],
    rating: 4.9,
  },
]

export const mockPlaces: Place[] = [
  {
    id: "p1",
    name: "Phở Bát Đàn",
    type: "food",
    city: "Hà Nội",
    address: "49 Bát Đàn, Hoàn Kiếm",
    lat: 21.0343,
    lng: 105.8484,
    priceAvg: 50000,
    rating: 4.8,
    reviewCount: 245,
    images: [
      "https://images.unsplash.com/photo-1557872200-0fc6f2b50340?w=500",
    ],
    description: "Phở truyền thống Hà Nội ngon nhất",
    tags: ["ẩm thực", "bộ đôi", "nổi tiếng"],
  },
  {
    id: "p2",
    name: "Hồ Hoàn Kiếm",
    type: "attraction",
    city: "Hà Nội",
    address: "Hoàn Kiếm, Hoàn Kiếm",
    lat: 21.0287,
    lng: 105.8524,
    rating: 4.7,
    reviewCount: 512,
    images: [
      "https://images.unsplash.com/photo-1528127269322-539801943592?w=500",
    ],
    description: "Hồ nước lớn giữa Hà Nội với tầm nhìn tuyệt đẹp",
    tags: ["tham quan", "công viên", "tự nhiên"],
  },
  {
    id: "p3",
    name: "Bún Chả Hương Liên",
    type: "food",
    city: "Hà Nội",
    address: "24 Lê Văn Hưu, Hai Bà Trưng",
    lat: 21.0214,
    lng: 105.8504,
    priceAvg: 60000,
    rating: 4.9,
    reviewCount: 890,
    images: [
      "https://images.unsplash.com/photo-1559411669-cd4628902d4a?w=500",
    ],
    description: "Quán bún chả nổi tiếng từng được Obama ghé thăm",
    tags: ["ẩm thực", "bộ đôi", "nổi tiếng"],
  },
  {
    id: "p4",
    name: "Văn Miếu Quốc Tử Giám",
    type: "attraction",
    city: "Hà Nội",
    address: "58 Quốc Tử Giám, Đống Đa",
    lat: 21.027,
    lng: 105.8358,
    rating: 4.6,
    reviewCount: 334,
    images: [
      "https://images.unsplash.com/photo-1548013146-72479768bada?w=500",
    ],
    description: "Trường đại học đầu tiên của Việt Nam, là di sản UNESCO",
    tags: ["tham quan", "di sản", "lịch sử"],
  },
  {
    id: "p5",
    name: "Xôi Yến",
    type: "food",
    city: "Hà Nội",
    address: "35B Nguyễn Hữu Huân, Hoàn Kiếm",
    lat: 21.0341,
    lng: 105.8551,
    priceAvg: 35000,
    rating: 4.5,
    reviewCount: 156,
    images: [
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500",
    ],
    description: "Xôi gà ngon nổi tiếng với nhiều loại topping",
    tags: ["ẩm thực", "sáng sớm", "phổ biến"],
  },
]

export const placeCategories = [
  { id: "food", label: "Ẩm thực" },
  { id: "attraction", label: "Tham quan" },
  { id: "accommodation", label: "Lưu trú" },
  { id: "transport", label: "Di chuyển" },
  { id: "activity", label: "Hoạt động" },
]

export function formatVnd(amount: number) {
  if (amount === 0) return "Miễn phí"
  return new Intl.NumberFormat("vi-VN").format(amount) + " VNĐ"
}
