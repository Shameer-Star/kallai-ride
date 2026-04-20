// Lightweight bilingual labels (Tamil + English).
// Used as `t.bookRide` etc. Tamil is primary, English shown beneath.
export const t = {
  appName: "Adhaiyu Ride",
  // Auth
  signIn: { en: "Sign In", ta: "உள்நுழை" },
  signUp: { en: "Sign Up", ta: "பதிவு செய்" },
  email: { en: "Email", ta: "மின்னஞ்சல்" },
  password: { en: "Password", ta: "கடவுச்சொல்" },
  fullName: { en: "Full Name", ta: "முழு பெயர்" },
  phone: { en: "Phone", ta: "தொலைபேசி" },
  iAmA: { en: "I am a", ta: "நான்" },
  customer: { en: "Customer", ta: "வாடிக்கையாளர்" },
  captain: { en: "Captain", ta: "கேப்டன்" },
  signOut: { en: "Sign Out", ta: "வெளியேறு" },
  // Customer
  pickup: { en: "Pickup", ta: "ஏறும் இடம்" },
  drop: { en: "Drop", ta: "இறங்கும் இடம்" },
  searchPlace: { en: "Search location...", ta: "இடம் தேடு..." },
  useMyLocation: { en: "Use my location", ta: "என் இருப்பிடம்" },
  bookRide: { en: "Book Ride", ta: "சவாரி பதிவு" },
  estimatedFare: { en: "Estimated Fare", ta: "மதிப்பிடப்பட்ட கட்டணம்" },
  searchingCaptain: { en: "Searching for nearby captain...", ta: "கேப்டனைத் தேடுகிறோம்..." },
  captainOnTheWay: { en: "Captain on the way", ta: "கேப்டன் வருகிறார்" },
  rideStarted: { en: "Ride in progress", ta: "சவாரி நடக்கிறது" },
  rideCompleted: { en: "Ride completed", ta: "சவாரி முடிந்தது" },
  cancel: { en: "Cancel", ta: "ரத்து" },
  // Captain
  goOnline: { en: "Go Online", ta: "ஆன்லைனில் வா" },
  goOffline: { en: "Go Offline", ta: "ஆஃப்லைன் ஆகு" },
  newRideRequest: { en: "New Ride Request", ta: "புதிய சவாரி கோரிக்கை" },
  accept: { en: "Accept", ta: "ஏற்று" },
  reject: { en: "Reject", ta: "மறு" },
  start: { en: "Start Ride", ta: "சவாரி தொடங்கு" },
  complete: { en: "Complete Ride", ta: "சவாரி முடி" },
  earnings: { en: "Today's Earnings", ta: "இன்றைய வருமானம்" },
  totalRides: { en: "Total Rides", ta: "மொத்த சவாரிகள்" },
  // Common
  history: { en: "Ride History", ta: "சவாரி வரலாறு" },
  home: { en: "Home", ta: "முகப்பு" },
  km: { en: "km", ta: "கி.மீ" },
};

export function bi(key: { en: string; ta: string }) {
  return `${key.ta} • ${key.en}`;
}
