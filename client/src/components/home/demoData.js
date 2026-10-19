// Illustrative sample data only. Nothing here is connected to payments or a backend.

export const DEMO_NOTE = 'Illustrative demo · sample data only';
export const SHARE = '₹600';

export const PEOPLE = [
  { id: 'you', name: 'You', tone: 1 },
  { id: 'aarav', name: 'Aarav', tone: 2, settledAt: 4 },
  { id: 'meera', name: 'Meera', tone: 3, settledAt: 5 },
  { id: 'kabir', name: 'Kabir', tone: 4, settledAt: 5 },
];

export const BALANCE_VALUES = ['₹1,800', '₹1,200', '₹0'];
export const BALANCE_CAPTIONS = ['3 friends pending', '2 friends pending', 'All settled!'];

export const CATEGORIES = [
  { label: 'Food', v: 0.85 },
  { label: 'Stay', v: 1 },
  { label: 'Travel', v: 0.55 },
  { label: 'Fun', v: 0.32 },
];

// Second product preview (totals: ₹10,500 → ₹2,625 each)
export const TRIP_EXPENSES = [
  { id: 1, icon: 'receipt', title: 'Dinner with friends', by: 'You', amount: '₹2,400' },
  { id: 2, icon: 'pin', title: 'Cab to hotel', by: 'Aarav', amount: '₹840' },
  { id: 3, icon: 'receipt', title: 'Beach shack lunch', by: 'Meera', amount: '₹1,260' },
  { id: 4, icon: 'home', title: 'Stay · 2 nights', by: 'Kabir', amount: '₹6,000' },
];

export const TRIP_BALANCES = [
  { name: 'Kabir', tone: 4, kind: 'get', label: 'gets ₹3,375', v: 1 },
  { name: 'Aarav', tone: 2, kind: 'owe', label: 'owes ₹1,785', v: 0.53 },
  { name: 'Meera', tone: 3, kind: 'owe', label: 'owes ₹1,365', v: 0.4 },
  { name: 'You', tone: 1, kind: 'owe', label: 'owe ₹225', v: 0.07 },
];

export const TRIP_SETTLEUPS = [
  'Aarav → Kabir · ₹1,785',
  'Meera → Kabir · ₹1,365',
  'You → Kabir · ₹225',
];
