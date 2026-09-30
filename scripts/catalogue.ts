// Hand-written reference data the seed picks from. Faker supplies people,
// addresses and randomness; these lists make the food itself believable.
// Prices are in naira here for readability and converted to kobo (x100) when seeded.

export type MenuCategory = 'mains' | 'sides' | 'soups' | 'drinks' | 'desserts';

export interface Dish {
  name: string;
  category: MenuCategory;
  minNaira: number;
  maxNaira: number;
}

export interface Cuisine {
  key: string; // stored in restaurants.cuisine and used by ?cuisine=
  nameTemplates: string[]; // "{name}" is replaced with a Faker surname
  dishes: Dish[];
}

// Shared by every cuisine so each menu has something to drink.
const drinks: Dish[] = [
  { name: 'Chapman', category: 'drinks', minNaira: 1500, maxNaira: 3000 },
  { name: 'Zobo', category: 'drinks', minNaira: 800, maxNaira: 1500 },
  { name: 'Kunu', category: 'drinks', minNaira: 700, maxNaira: 1200 },
  { name: 'Bottled Water', category: 'drinks', minNaira: 300, maxNaira: 600 },
  { name: 'Fresh Orange Juice', category: 'drinks', minNaira: 1500, maxNaira: 2800 },
  { name: 'Malt Drink', category: 'drinks', minNaira: 600, maxNaira: 1000 },
];

const cuisinesWithoutDrinks: Cuisine[] = [
  {
    key: 'nigerian',
    nameTemplates: ["Mama {name}'s Kitchen", '{name} Buka', 'Iya {name} Canteen', '{name} Local Pot'],
    dishes: [
      { name: 'Jollof Rice and Chicken', category: 'mains', minNaira: 3000, maxNaira: 6500 },
      { name: 'Fried Rice and Turkey', category: 'mains', minNaira: 3500, maxNaira: 7500 },
      { name: 'Ofada Rice with Ayamase', category: 'mains', minNaira: 3500, maxNaira: 6000 },
      { name: 'Amala and Ewedu', category: 'mains', minNaira: 2000, maxNaira: 4000 },
      { name: 'Pounded Yam', category: 'mains', minNaira: 1500, maxNaira: 3000 },
      { name: 'Eba', category: 'sides', minNaira: 500, maxNaira: 1000 },
      { name: 'Egusi Soup', category: 'soups', minNaira: 2500, maxNaira: 5000 },
      { name: 'Efo Riro', category: 'soups', minNaira: 2500, maxNaira: 5000 },
      { name: 'Ogbono Soup', category: 'soups', minNaira: 2500, maxNaira: 4500 },
      { name: 'Banga Soup', category: 'soups', minNaira: 3000, maxNaira: 6000 },
      { name: 'Fried Plantain', category: 'sides', minNaira: 800, maxNaira: 1500 },
      { name: 'Moi Moi', category: 'sides', minNaira: 700, maxNaira: 1500 },
      { name: 'Puff Puff', category: 'desserts', minNaira: 500, maxNaira: 1200 },
      { name: 'Asun', category: 'sides', minNaira: 3000, maxNaira: 6000 },
      { name: 'Native Soup', category: 'soups', minNaira: 3500, maxNaira: 7000 },
      { name: 'Owo Soup and Starch', category: 'soups', minNaira: 3000, maxNaira: 6000 },
      { name: 'Afang Soup', category: 'soups', minNaira: 3000, maxNaira: 6000 },
      { name: 'Edikang Ikong', category: 'soups', minNaira: 3500, maxNaira: 6500 },
    ],
  },
  {
    key: 'grill',
    nameTemplates: ['{name} Suya Spot', '{name} Grill House', '{name} Bole Joint', '{name} BBQ Yard'],
    dishes: [
      { name: 'Bole and Fish', category: 'mains', minNaira: 2500, maxNaira: 6000 },
      { name: 'Beef Suya', category: 'mains', minNaira: 2000, maxNaira: 5000 },
      { name: 'Chicken Suya', category: 'mains', minNaira: 2500, maxNaira: 5500 },
      { name: 'Ram Suya', category: 'mains', minNaira: 3000, maxNaira: 7000 },
      { name: 'Kilishi', category: 'sides', minNaira: 2000, maxNaira: 4500 },
      { name: 'Grilled Catfish', category: 'mains', minNaira: 6000, maxNaira: 12000 },
      { name: 'Grilled Croaker', category: 'mains', minNaira: 7000, maxNaira: 14000 },
      { name: 'Peppered Gizzard', category: 'sides', minNaira: 2500, maxNaira: 4500 },
      { name: 'Roasted Plantain (Boli)', category: 'sides', minNaira: 800, maxNaira: 1500 },
      { name: 'Roasted Yam', category: 'sides', minNaira: 1000, maxNaira: 2000 },
      { name: 'Grilled Chicken Wings', category: 'mains', minNaira: 3000, maxNaira: 6000 },
      { name: 'Coleslaw', category: 'sides', minNaira: 700, maxNaira: 1500 },
    ],
  },
  {
    key: 'pizza',
    nameTemplates: ['{name} Pizzeria', 'Slice of {name}', '{name} Pizza Co.', '{name} Wood Fire'],
    dishes: [
      { name: 'Margherita Pizza', category: 'mains', minNaira: 6000, maxNaira: 11000 },
      { name: 'Pepperoni Pizza', category: 'mains', minNaira: 7500, maxNaira: 13000 },
      { name: 'Suya Pizza', category: 'mains', minNaira: 8000, maxNaira: 14000 },
      { name: 'BBQ Chicken Pizza', category: 'mains', minNaira: 8000, maxNaira: 14000 },
      { name: 'Veggie Supreme Pizza', category: 'mains', minNaira: 7000, maxNaira: 12000 },
      { name: 'Meat Lovers Pizza', category: 'mains', minNaira: 9000, maxNaira: 15000 },
      { name: 'Garlic Bread', category: 'sides', minNaira: 1500, maxNaira: 3000 },
      { name: 'Chicken Wings (6 pcs)', category: 'sides', minNaira: 3000, maxNaira: 5500 },
      { name: 'Potato Wedges', category: 'sides', minNaira: 1500, maxNaira: 3000 },
      { name: 'Chocolate Brownie', category: 'desserts', minNaira: 1500, maxNaira: 3000 },
      { name: 'Ice Cream Tub', category: 'desserts', minNaira: 2000, maxNaira: 4000 },
    ],
  },
  {
    key: 'shawarma',
    nameTemplates: ['{name} Shawarma Hub', "{name}'s Wraps", 'Chop {name} Shawarma', '{name} Street Wraps'],
    dishes: [
      { name: 'Chicken Shawarma', category: 'mains', minNaira: 3000, maxNaira: 5500 },
      { name: 'Beef Shawarma', category: 'mains', minNaira: 3000, maxNaira: 5500 },
      { name: 'Double Sausage Shawarma', category: 'mains', minNaira: 3500, maxNaira: 6500 },
      { name: 'Chicken Burger', category: 'mains', minNaira: 3500, maxNaira: 6000 },
      { name: 'Beef Burger', category: 'mains', minNaira: 3500, maxNaira: 6500 },
      { name: 'Loaded Fries', category: 'sides', minNaira: 2500, maxNaira: 4500 },
      { name: 'French Fries', category: 'sides', minNaira: 1200, maxNaira: 2500 },
      { name: 'Hot Dog', category: 'mains', minNaira: 2000, maxNaira: 3500 },
      { name: 'Milkshake', category: 'desserts', minNaira: 2000, maxNaira: 4000 },
      { name: 'Doughnut', category: 'desserts', minNaira: 600, maxNaira: 1500 },
    ],
  },
  {
    key: 'chinese',
    nameTemplates: ['Golden {name} Chinese', '{name} Wok', 'Jade {name} Kitchen', '{name} Dragon House'],
    dishes: [
      { name: 'Special Fried Rice', category: 'mains', minNaira: 4000, maxNaira: 8000 },
      { name: 'Chicken Noodles', category: 'mains', minNaira: 3500, maxNaira: 7000 },
      { name: 'Sweet and Sour Chicken', category: 'mains', minNaira: 5000, maxNaira: 9000 },
      { name: 'Beef in Black Bean Sauce', category: 'mains', minNaira: 5500, maxNaira: 9500 },
      { name: 'Singapore Noodles', category: 'mains', minNaira: 4500, maxNaira: 8000 },
      { name: 'Spring Rolls (4 pcs)', category: 'sides', minNaira: 2000, maxNaira: 3500 },
      { name: 'Hot and Sour Soup', category: 'soups', minNaira: 2500, maxNaira: 4500 },
      { name: 'Prawn Crackers', category: 'sides', minNaira: 1000, maxNaira: 2000 },
      { name: 'Egg Fried Rice', category: 'sides', minNaira: 2500, maxNaira: 4500 },
      { name: 'Fortune Cookies', category: 'desserts', minNaira: 800, maxNaira: 1500 },
    ],
  },
  {
    key: 'seafood',
    nameTemplates: ['{name} Seafood Bar', 'Bight of {name}', '{name} Catch', '{name} Pepper Soup Joint'],
    dishes: [
      { name: 'Catfish Pepper Soup', category: 'soups', minNaira: 5000, maxNaira: 9000 },
      { name: 'Goat Meat Pepper Soup', category: 'soups', minNaira: 4000, maxNaira: 7500 },
      { name: 'Seafood Okra', category: 'soups', minNaira: 6000, maxNaira: 12000 },
      { name: 'Grilled Prawns', category: 'mains', minNaira: 9000, maxNaira: 18000 },
      { name: 'Fisherman Soup', category: 'soups', minNaira: 8000, maxNaira: 15000 },
      { name: 'Peppered Snail', category: 'sides', minNaira: 5000, maxNaira: 10000 },
      { name: 'Periwinkle Pepper Soup', category: 'soups', minNaira: 4500, maxNaira: 8500 },
      { name: 'Fried Calamari', category: 'sides', minNaira: 5000, maxNaira: 9000 },
      { name: 'Seafood Fried Rice', category: 'mains', minNaira: 6000, maxNaira: 11000 },
      { name: 'Boiled Yam', category: 'sides', minNaira: 1000, maxNaira: 2000 },
      { name: 'Fried Plantain', category: 'sides', minNaira: 800, maxNaira: 1500 },
    ],
  },
  {
    key: 'breakfast',
    nameTemplates: ['{name} Morning Cafe', 'Rise with {name}', "{name}'s Bakery", '{name} Tea Room'],
    dishes: [
      { name: 'Akara and Pap', category: 'mains', minNaira: 1200, maxNaira: 2500 },
      { name: 'Yam and Egg Sauce', category: 'mains', minNaira: 2000, maxNaira: 4000 },
      { name: 'Full English Breakfast', category: 'mains', minNaira: 5000, maxNaira: 9000 },
      { name: 'Pancakes with Syrup', category: 'mains', minNaira: 3000, maxNaira: 5500 },
      { name: 'Agege Bread and Beans', category: 'mains', minNaira: 1500, maxNaira: 3000 },
      { name: 'Meat Pie', category: 'sides', minNaira: 800, maxNaira: 1800 },
      { name: 'Sausage Roll', category: 'sides', minNaira: 700, maxNaira: 1500 },
      { name: 'Chin Chin', category: 'desserts', minNaira: 500, maxNaira: 1200 },
      { name: 'Cappuccino', category: 'drinks', minNaira: 2000, maxNaira: 4000 },
      { name: 'Hot Chocolate', category: 'drinks', minNaira: 1800, maxNaira: 3500 },
    ],
  },
];

export const cuisines: Cuisine[] = cuisinesWithoutDrinks.map((cuisine) => ({
  ...cuisine,
  dishes: [...cuisine.dishes, ...drinks],
}));

// Port Harcourt areas, each with a few of its well-known streets, so an
// address reads like "14 Rumuola Road, Rumuola, Port Harcourt".
// Realistic flavour for demo data, not a survey-grade street map.
export const streetsByArea: Record<string, string[]> = {
  'GRA Phase 2': ['Tombia Street', 'Sani Abacha Road', 'Ezimgbu Link Road'],
  'Old GRA': ['Forces Avenue', 'Hospital Road', 'Harley Street'],
  Rumuola: ['Rumuola Road', 'Aba Road', 'Stadium Road'],
  'Trans-Amadi': ['Trans-Amadi Road', 'Old Aba Road', 'Nkpogu Road'],
  'D-Line': ['Emenike Street', 'Okoroma Street', 'Ojoto Street'],
  Woji: ['Woji Road', 'Elijiji Road', 'YKC Road'],
  Rumuokoro: ['Ikwerre Road', 'Eneka Link Road', 'Rumuokoro Market Road'],
  Eliozu: ['Eliozu Road', 'Airport Road', 'Rumuodara Road'],
  'Ada George': ['Ada George Road', 'Ozuoba Road', 'Mgbuoba Road'],
  Choba: ['East-West Road', 'University Road', 'Choba Park Road'],
  Diobu: ['Ikwerre Road', 'Wobo Street', 'Mile 1 Market Road'],
  Borokiri: ['Borokiri Road', 'Harbour Road', 'Amadi Street'],
  Elelenwo: ['Elelenwo Street', 'Akpajo Road', 'Old Refinery Road'],
  'Peter Odili Road': ['Peter Odili Road', 'Rumuibekwe Road', 'Trans-Woji Road'],
};

export const areas = Object.keys(streetsByArea);

// Surnames common in Rivers State (Ijaw, Ikwerre, Ogoni, Igbo, Kalabari),
// used for restaurant names like "Mama Ibiere's Kitchen".
export const riversSurnames = [
  'Amadi', 'Briggs', 'Dagogo', 'Tamuno', 'Horsfall', 'Ibiere', 'Iboroma', 'Ogbonda',
  'Worlu', 'Nyeche', 'Ihunwo', 'Wokoma', 'Georgewill', 'Jaja', 'Kalio', 'Obuah',
  'Ekine', 'Ogan', 'Harry', 'Nwachukwu', 'Opara', 'Wike', 'Achinike', 'Eke',
  'Ndu', 'Okwu', 'Owhor', 'Chinda', 'Amachree', 'Fubara', 'Princewill', 'Sekibo',
];

// Menu descriptions, picked per dish by category. Short, plain lines like a
// real delivery app shows under each dish name.
export const descriptionsByCategory: Record<MenuCategory, string[]> = {
  mains: [
    'Cooked fresh to order and served hot.',
    'Our most popular plate, a generous portion.',
    'Slow-cooked with peppers, onions and house spices.',
    'Made the traditional way, the way regulars like it.',
    'Hearty and filling, served with a side of pepper sauce.',
    "Chef's special, prepared in small batches every day.",
  ],
  sides: [
    'Perfect alongside any main.',
    'Crispy outside, soft inside.',
    'Freshly prepared, great for sharing.',
    'A small portion to complete your meal.',
    'Lightly seasoned and served warm.',
  ],
  soups: [
    'Rich and well spiced, with assorted meat.',
    'Thick, flavourful and cooked with fresh leaves.',
    'Served with your choice of swallow.',
    'Slow-simmered for depth of flavour.',
    'Loaded with fish and meat, a local favourite.',
  ],
  drinks: [
    'Served chilled.',
    'Freshly made every morning.',
    'Cold and refreshing, 50cl.',
    'No added sugar.',
    'The perfect drink for a hot afternoon.',
  ],
  desserts: [
    'A sweet way to finish your meal.',
    'Freshly made, best enjoyed warm.',
    'Small, sweet and easy to share.',
    'Made in-house every day.',
  ],
};
