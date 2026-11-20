/* data/news.js — Model: News { id, status: published|draft, featured, title, excerpt, date, category, image (id من RAZI.images|null), url } */
RAZI.news = [
  { id: "n1", status: "published", featured: true,  title: "عنوان الخبر الرئيسي (تجريبي)", excerpt: "وصف مختصر تجريبي للخبر الرئيسي. سيُستبدل بخبر حقيقي تنشره المؤسسة.", date: D(0), category: "خبر مهم", image: "gardenHeart", url: "#news", demo: true },
  { id: "n2", status: "published", featured: true,  title: "خبر تجريبي ثانٍ", excerpt: "وصف مختصر تجريبي.", date: D(1), category: "نشاط", image: "courtyard", url: "#news", demo: true },
  { id: "n3", status: "published", featured: true,  title: "خبر تجريبي ثالث", excerpt: "وصف مختصر تجريبي.", date: D(3), category: "مسابقة", image: "gardenPink", url: "#news", demo: true },
  { id: "n4", status: "published", featured: true,  title: "خبر تجريبي رابع", excerpt: "وصف مختصر تجريبي.", date: D(6), category: "حياة مدرسية", image: "entrance", url: "#news", demo: true },
  { id: "n5", status: "published", featured: false, title: "خبر تجريبي خامس", excerpt: "وصف مختصر تجريبي.", date: D(12), category: "إعلان", image: null, url: "#news", demo: true }
];
