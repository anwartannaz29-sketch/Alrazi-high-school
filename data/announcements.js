/* data/announcements.js — Model: Announcement { id, status, pinned, type, title, body, date, file|null } — للإعلانات الرسمية فقط */
RAZI.announcementTypes = ["إداري", "موعد", "وثيقة", "تغيير", "تنبيه"];
RAZI.announcements = [
  { id: "a1", status: "published", pinned: true, type: "تنبيه", title: "إعلان مثبّت تجريبي", body: "مكان الإعلان الرسمي المهم الذي تريد المؤسسة تثبيته في أعلى القائمة.", date: D(0), file: null, demo: true },
  { id: "a2", status: "published", pinned: false, type: "موعد", title: "إعلان موعد (تجريبي)", body: "نص تجريبي.", date: D(2), file: null, demo: true },
  { id: "a3", status: "published", pinned: false, type: "وثيقة", title: "إعلان وثيقة (تجريبي)", body: "نص تجريبي.", date: D(5), file: null, demo: true },
  { id: "a4", status: "published", pinned: false, type: "إداري", title: "إعلان إداري (تجريبي)", body: "نص تجريبي.", date: D(9), file: null, demo: true }
];
