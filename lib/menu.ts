export type Portion = 'small' | 'regular';
export type Dish = {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  price: number;
  smallPrice: number;
  grams: number;
  smallGrams: number;
  model: string;
  color: string;
  tag: string;
  ingredients: string;
  allergens: string[];
  vegetarian: boolean;
  minutes: number;
  variants?: [string, string];
  requests?: string[];
};
export const menu: Dish[] = [
  {
    id: 'burger',
    variants: ['Single patty', 'Double patty'],
    requests: ['No onions', 'No cheese', 'Sauce on the side'],
    name: 'The house burger',
    subtitle: 'Juicy beef. Melted cheddar. The good stuff.',
    category: 'Mains',
    price: 145,
    smallPrice: 95,
    grams: 340,
    smallGrams: 200,
    model: 'burger',
    color: '#f5dec6',
    tag: 'A crowd favourite',
    ingredients:
      'Beef patty, cheddar, lettuce, tomato, onion, brioche bun, house sauce.',
    allergens: ['gluten', 'milk', 'eggs', 'mustard'],
    vegetarian: false,
    minutes: 15,
  },
  {
    id: 'pizza',
    variants: ['20 cm pizza', '30 cm pizza'],
    requests: ['No pepperoni', 'No basil', 'Cut for sharing'],
    name: 'Pepperoni pizza',
    subtitle: 'Crispy edges. Always room for one more slice.',
    category: 'Mains',
    price: 135,
    smallPrice: 79,
    grams: 420,
    smallGrams: 210,
    model: 'pizza',
    color: '#f6e6a9',
    tag: 'Made for sharing',
    ingredients: 'Pizza dough, tomato sauce, mozzarella, pepperoni, basil.',
    allergens: ['gluten', 'milk'],
    vegetarian: false,
    minutes: 18,
  },
  {
    id: 'salad',
    variants: ['Side bowl', 'Meal bowl'],
    requests: ['Dressing on the side', 'No tomatoes', 'No cucumber'],
    name: 'The green break',
    subtitle: 'Fresh leaves, a little crunch, a lemony finish.',
    category: 'Sides',
    price: 85,
    smallPrice: 49,
    grams: 240,
    smallGrams: 120,
    model: 'salad',
    color: '#dce9cc',
    tag: 'Light & lovely',
    ingredients: 'Lettuce, cucumber, tomato, olive oil, lemon.',
    allergens: [],
    vegetarian: true,
    minutes: 7,
  },
  {
    id: 'fries',
    variants: ['Side · 100 g', 'Sharing · 200 g'],
    requests: ['No truffle oil', 'No added salt'],
    name: 'Truffle fries',
    subtitle: 'Golden, crispy, and very hard to share.',
    category: 'Sides',
    price: 55,
    smallPrice: 35,
    grams: 200,
    smallGrams: 100,
    model: 'fries',
    color: '#ebdfcd',
    tag: 'Your burger’s best friend',
    ingredients: 'Potato, truffle oil, sea salt.',
    allergens: [],
    vegetarian: true,
    minutes: 8,
  },
  {
    id: 'cake',
    variants: ['Tasting slice · 80 g', 'Slice · 160 g'],
    requests: [],
    name: 'A little celebration',
    subtitle: 'Strawberry cake. No occasion necessary.',
    category: 'Desserts',
    price: 65,
    smallPrice: 39,
    grams: 160,
    smallGrams: 80,
    model: 'cake',
    color: '#eed9e2',
    tag: 'Save a little room',
    ingredients: 'Sponge cake, cream frosting, strawberries.',
    allergens: ['gluten', 'milk', 'eggs'],
    vegetarian: true,
    minutes: 4,
  },
  {
    id: 'icecream',
    variants: ['1 scoop', '2 scoops'],
    requests: ['In a cup', 'No waffle cone'],
    name: 'Vanilla cloud',
    subtitle: 'Real vanilla meets a crunchy waffle cone.',
    category: 'Desserts',
    price: 45,
    smallPrice: 29,
    grams: 140,
    smallGrams: 70,
    model: 'icecream',
    color: '#d9e4ec',
    tag: 'One scoop or two?',
    ingredients: 'Milk, cream, vanilla, sugar, waffle cone.',
    allergens: ['milk', 'gluten'],
    vegetarian: true,
    minutes: 3,
  },
  {
    id: 'lemonade',
    name: 'House lemonade',
    subtitle: 'Lemon, mint and a little sparkle.',
    category: 'Drinks',
    price: 55,
    smallPrice: 35,
    grams: 400,
    smallGrams: 200,
    model: 'lemonade',
    color: '#f6e6a9',
    tag: 'Made here',
    ingredients: 'Lemon, mint, sugar, sparkling water.',
    allergens: [],
    vegetarian: true,
    minutes: 2,
    variants: ['200 ml glass', '400 ml glass'],
    requests: ['No ice', 'Less ice', 'No mint'],
  },
  {
    id: 'water',
    name: 'Table water',
    subtitle: 'Chilled still or sparkling water.',
    category: 'Drinks',
    price: 35,
    smallPrice: 20,
    grams: 750,
    smallGrams: 330,
    model: 'water',
    color: '#d9e4ec',
    tag: 'For the table',
    ingredients: 'Water.',
    allergens: [],
    vegetarian: true,
    minutes: 1,
    variants: ['330 ml bottle', '750 ml bottle'],
    requests: ['Sparkling', 'Still', 'Room temperature'],
  },
  {
    id: 'coffee',
    name: 'Espresso',
    subtitle: 'Freshly pulled, rich and aromatic.',
    category: 'Drinks',
    price: 32,
    smallPrice: 25,
    grams: 60,
    smallGrams: 30,
    model: 'coffee',
    color: '#ebdfcd',
    tag: 'A good finish',
    ingredients: 'Coffee, water.',
    allergens: [],
    vegetarian: true,
    minutes: 3,
    variants: ['Single shot', 'Double shot'],
    requests: ['Decaf'],
  },
];
export const priceFor = (d: Dish, p: Portion) =>
  p === 'small' ? d.smallPrice : d.price;
export const gramsFor = (d: Dish, p: Portion) =>
  p === 'small' ? d.smallGrams : d.grams;
export type Advice = {
  text: string;
  items: { id: string; portion: Portion }[];
};

export const variantFor = (d: Dish, p: Portion) =>
  d.variants?.[p === 'small' ? 0 : 1] || (p === 'small' ? 'Tasting' : 'Plate');
