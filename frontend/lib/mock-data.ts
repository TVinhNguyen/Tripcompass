// Mock data for TripCompass - Vietnamese destinations only

export interface Destination {
  id: string;
  name: string;
  nameEn: string;
  image: string;
  description: string;
  descriptionEn: string;
  region: 'north' | 'central' | 'south';
  tags: string[];
}

export interface Itinerary {
  id: string;
  title: string;
  titleEn: string;
  destination: string;
  duration: number;
  budget: 'budget' | 'moderate' | 'luxury';
  coverImage: string;
  author: {
    name: string;
    avatar: string;
  };
  likes: number;
  views: number;
  tags: string[];
  status: 'draft' | 'published';
  activities: Activity[];
  createdAt: string;
}

export interface Activity {
  id: string;
  day: number;
  time: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  type: 'food' | 'attraction' | 'transport' | 'accommodation' | 'activity';
  location: string;
  duration: number;
  cost?: number;
  image?: string;
}

export const destinations: Destination[] = [
  {
    id: 'ha-long',
    name: 'Vịnh Hạ Long',
    nameEn: 'Ha Long Bay',
    image: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=800',
    description: 'Di sản thiên nhiên thế giới với hàng nghìn đảo đá vôi',
    descriptionEn: 'UNESCO World Heritage Site with thousands of limestone islands',
    region: 'north',
    tags: ['beach', 'nature', 'cruise', 'unesco'],
  },
  {
    id: 'da-nang',
    name: 'Đà Nẵng',
    nameEn: 'Da Nang',
    image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800',
    description: 'Thành phố biển hiện đại với Bà Nà Hills và cầu Vàng',
    descriptionEn: 'Modern coastal city with Ba Na Hills and Golden Bridge',
    region: 'central',
    tags: ['beach', 'city', 'modern', 'bridge'],
  },
  {
    id: 'hoi-an',
    name: 'Hội An',
    nameEn: 'Hoi An',
    image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800',
    description: 'Phố cổ lung linh với đèn lồng và ẩm thực tuyệt vời',
    descriptionEn: 'Ancient town glowing with lanterns and amazing cuisine',
    region: 'central',
    tags: ['culture', 'food', 'history', 'unesco'],
  },
  {
    id: 'da-lat',
    name: 'Đà Lạt',
    nameEn: 'Da Lat',
    image: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800',
    description: 'Thành phố ngàn hoa với khí hậu mát mẻ quanh năm',
    descriptionEn: 'City of flowers with cool climate year-round',
    region: 'central',
    tags: ['nature', 'romantic', 'flowers', 'cool'],
  },
  {
    id: 'nha-trang',
    name: 'Nha Trang',
    nameEn: 'Nha Trang',
    image: 'https://images.unsplash.com/photo-1573790387438-4da905039392?w=800',
    description: 'Thành phố biển xinh đẹp với bãi biển tuyệt vời',
    descriptionEn: 'Beautiful coastal city with stunning beaches',
    region: 'central',
    tags: ['beach', 'diving', 'resort', 'islands'],
  },
  {
    id: 'ha-noi',
    name: 'Hà Nội',
    nameEn: 'Hanoi',
    image: 'https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?w=800',
    description: 'Thủ đô nghìn năm văn hiến với ẩm thực đường phố',
    descriptionEn: 'Capital city with thousand years of history and street food',
    region: 'north',
    tags: ['culture', 'food', 'history', 'city'],
  },
  {
    id: 'sapa',
    name: 'Sapa',
    nameEn: 'Sapa',
    image: 'https://images.unsplash.com/photo-1570366583862-f91883984fde?w=800',
    description: 'Ruộng bậc thang tuyệt đẹp và văn hóa dân tộc',
    descriptionEn: 'Stunning terraced rice fields and ethnic culture',
    region: 'north',
    tags: ['nature', 'trekking', 'culture', 'mountains'],
  },
  {
    id: 'phu-quoc',
    name: 'Phú Quốc',
    nameEn: 'Phu Quoc',
    image: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800',
    description: 'Đảo ngọc với bãi biển hoang sơ và resort sang trọng',
    descriptionEn: 'Pearl island with pristine beaches and luxury resorts',
    region: 'south',
    tags: ['beach', 'island', 'resort', 'seafood'],
  },
];

export const trendingItineraries: Itinerary[] = [
  {
    id: '1',
    title: 'Hà Nội Ẩm Thực 3 Ngày',
    titleEn: 'Hanoi Food Tour 3 Days',
    destination: 'ha-noi',
    duration: 3,
    budget: 'budget',
    coverImage: 'https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?w=800',
    author: {
      name: 'Mai Linh',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    },
    likes: 1234,
    views: 5678,
    tags: ['food', 'culture', 'budget'],
    status: 'published',
    activities: [],
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    title: 'Đà Nẵng - Hội An 5 Ngày',
    titleEn: 'Da Nang - Hoi An 5 Days',
    destination: 'da-nang',
    duration: 5,
    budget: 'moderate',
    coverImage: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800',
    author: {
      name: 'Minh Tuấn',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    },
    likes: 2156,
    views: 8432,
    tags: ['beach', 'culture', 'photography'],
    status: 'published',
    activities: [],
    createdAt: '2024-02-10',
  },
  {
    id: '3',
    title: 'Đà Lạt Lãng Mạn 4 Ngày',
    titleEn: 'Romantic Da Lat 4 Days',
    destination: 'da-lat',
    duration: 4,
    budget: 'moderate',
    coverImage: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800',
    author: {
      name: 'Hương Giang',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
    },
    likes: 1876,
    views: 6234,
    tags: ['romantic', 'nature', 'photography'],
    status: 'published',
    activities: [],
    createdAt: '2024-02-20',
  },
  {
    id: '4',
    title: 'Nha Trang Biển Xanh 3 Ngày',
    titleEn: 'Nha Trang Beach 3 Days',
    destination: 'nha-trang',
    duration: 3,
    budget: 'budget',
    coverImage: 'https://images.unsplash.com/photo-1573790387438-4da905039392?w=800',
    author: {
      name: 'Thanh Hùng',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
    },
    likes: 987,
    views: 3456,
    tags: ['beach', 'diving', 'relaxation'],
    status: 'published',
    activities: [],
    createdAt: '2024-03-01',
  },
  {
    id: '5',
    title: 'Phú Quốc Nghỉ Dưỡng 5 Ngày',
    titleEn: 'Phu Quoc Retreat 5 Days',
    destination: 'phu-quoc',
    duration: 5,
    budget: 'luxury',
    coverImage: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800',
    author: {
      name: 'Lan Anh',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100',
    },
    likes: 2543,
    views: 9876,
    tags: ['luxury', 'beach', 'resort'],
    status: 'published',
    activities: [],
    createdAt: '2024-03-05',
  },
  {
    id: '6',
    title: 'Sapa Trekking 4 Ngày',
    titleEn: 'Sapa Trekking 4 Days',
    destination: 'sapa',
    duration: 4,
    budget: 'budget',
    coverImage: 'https://images.unsplash.com/photo-1570366583862-f91883984fde?w=800',
    author: {
      name: 'Văn Nam',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100',
    },
    likes: 1654,
    views: 5432,
    tags: ['trekking', 'nature', 'culture'],
    status: 'published',
    activities: [],
    createdAt: '2024-03-10',
  },
];

export const suggestionChips = [
  { text: 'Nha Trang 3 ngày', icon: 'sun' },
  { text: 'Đà Lạt tiết kiệm', icon: 'wallet' },
  { text: 'Hà Nội ẩm thực', icon: 'utensils' },
  { text: 'Đà Nẵng 5 ngày', icon: 'map-pin' },
  { text: 'Hội An đêm phố', icon: 'moon' },
];

export const features = [
  {
    icon: 'sparkles',
    title: 'AI Thông Minh',
    titleEn: 'Smart AI',
    description: 'Gợi ý lịch trình cá nhân hóa dựa trên sở thích của bạn',
    descriptionEn: 'Personalized itinerary suggestions based on your preferences',
  },
  {
    icon: 'users',
    title: 'Cộng Đồng',
    titleEn: 'Community',
    description: 'Khám phá và chia sẻ lịch trình với cộng đồng du lịch',
    descriptionEn: 'Discover and share itineraries with the travel community',
  },
  {
    icon: 'calendar',
    title: 'Dễ Dàng Lập Kế Hoạch',
    titleEn: 'Easy Planning',
    description: 'Kéo thả để tạo lịch trình hoàn hảo trong vài phút',
    descriptionEn: 'Drag and drop to create perfect itineraries in minutes',
  },
  {
    icon: 'wallet',
    title: 'Quản Lý Ngân Sách',
    titleEn: 'Budget Management',
    description: 'Theo dõi chi phí và tối ưu hóa ngân sách chuyến đi',
    descriptionEn: 'Track expenses and optimize your trip budget',
  },
];

export const testimonials = [
  {
    name: 'Nguyễn Thị Mai',
    role: 'Travel Blogger',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    content: 'TripCompass đã thay đổi cách tôi lên kế hoạch du lịch. AI gợi ý những địa điểm tuyệt vời mà tôi chưa từng biết!',
    contentEn: 'TripCompass changed how I plan my trips. The AI suggests amazing places I never knew existed!',
  },
  {
    name: 'Trần Văn Hoàng',
    role: 'Photographer',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    content: 'Tính năng kéo thả rất trực quan. Tôi đã tạo được lịch trình hoàn hảo cho chuyến chụp ảnh Sapa trong 10 phút.',
    contentEn: 'The drag-and-drop feature is so intuitive. I created a perfect Sapa photography trip itinerary in 10 minutes.',
  },
  {
    name: 'Lê Minh Anh',
    role: 'Digital Nomad',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
    content: 'Cộng đồng TripCompass chia sẻ những lịch trình thực sự hữu ích. Tôi đã tiết kiệm được rất nhiều thời gian nghiên cứu.',
    contentEn: 'The TripCompass community shares really useful itineraries. I saved so much research time.',
  },
];

// Sample itinerary with full activities for detail view
export const sampleItinerary: Itinerary = {
  id: 'sample-1',
  title: 'Hà Nội Ẩm Thực 3 Ngày',
  titleEn: 'Hanoi Food Tour 3 Days',
  destination: 'ha-noi',
  duration: 3,
  budget: 'budget',
  coverImage: 'https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?w=800',
  author: {
    name: 'Mai Linh',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
  },
  likes: 1234,
  views: 5678,
  tags: ['food', 'culture', 'budget'],
  status: 'published',
  createdAt: '2024-01-15',
  activities: [
    {
      id: 'a1',
      day: 1,
      time: '07:00',
      title: 'Phở Bát Đàn',
      titleEn: 'Pho Bat Dan',
      description: 'Thưởng thức tô phở nổi tiếng nhất Hà Nội',
      descriptionEn: 'Enjoy the most famous pho in Hanoi',
      type: 'food',
      location: '49 Bát Đàn, Hoàn Kiếm',
      duration: 60,
      cost: 50000,
    },
    {
      id: 'a2',
      day: 1,
      time: '09:00',
      title: 'Hồ Hoàn Kiếm',
      titleEn: 'Hoan Kiem Lake',
      description: 'Dạo quanh hồ và ghé thăm Đền Ngọc Sơn',
      descriptionEn: 'Walk around the lake and visit Ngoc Son Temple',
      type: 'attraction',
      location: 'Hồ Hoàn Kiếm, Hoàn Kiếm',
      duration: 120,
      cost: 30000,
    },
    {
      id: 'a3',
      day: 1,
      time: '12:00',
      title: 'Bún Chả Hương Liên',
      titleEn: 'Bun Cha Huong Lien',
      description: 'Quán bún chả Obama từng ghé thăm',
      descriptionEn: 'The bun cha restaurant Obama visited',
      type: 'food',
      location: '24 Lê Văn Hưu, Hai Bà Trưng',
      duration: 60,
      cost: 60000,
    },
    {
      id: 'a4',
      day: 2,
      time: '08:00',
      title: 'Bánh Cuốn Thanh Vân',
      titleEn: 'Banh Cuon Thanh Van',
      description: 'Bánh cuốn nóng hổi với nước chấm đậm đà',
      descriptionEn: 'Hot steamed rice rolls with savory dipping sauce',
      type: 'food',
      location: '14 Hàng Gà, Hoàn Kiếm',
      duration: 45,
      cost: 40000,
    },
    {
      id: 'a5',
      day: 2,
      time: '10:00',
      title: 'Văn Miếu Quốc Tử Giám',
      titleEn: 'Temple of Literature',
      description: 'Trường đại học đầu tiên của Việt Nam',
      descriptionEn: 'Vietnam\'s first university',
      type: 'attraction',
      location: '58 Quốc Tử Giám, Đống Đa',
      duration: 90,
      cost: 30000,
    },
    {
      id: 'a6',
      day: 3,
      time: '07:00',
      title: 'Xôi Yến',
      titleEn: 'Xoi Yen',
      description: 'Xôi ngon nổi tiếng với nhiều loại topping',
      descriptionEn: 'Famous sticky rice with various toppings',
      type: 'food',
      location: '35B Nguyễn Hữu Huân, Hoàn Kiếm',
      duration: 45,
      cost: 35000,
    },
  ],
};
