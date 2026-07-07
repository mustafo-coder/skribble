/**
 * Seeds the shared word dictionary. Idempotent: uses upsert on the
 * (text, language) unique key, so re-running is safe.
 *
 *   npm run db:seed   (or `prisma db seed`)
 */
import { Language, PrismaClient, WordCategory, WordDifficulty } from '@prisma/client';

const prisma = new PrismaClient();

type Seed = { text: string; difficulty?: WordDifficulty };

const EN: Record<WordCategory, Seed[]> = {
  ANIMALS: [
    { text: 'cat' }, { text: 'dog' }, { text: 'elephant', difficulty: 'MEDIUM' },
    { text: 'giraffe', difficulty: 'MEDIUM' }, { text: 'penguin' }, { text: 'octopus', difficulty: 'HARD' },
    { text: 'kangaroo', difficulty: 'MEDIUM' }, { text: 'butterfly' }, { text: 'rhinoceros', difficulty: 'HARD' },
    { text: 'dolphin' }, { text: 'hedgehog', difficulty: 'HARD' }, { text: 'crocodile', difficulty: 'MEDIUM' },
    { text: 'lion' }, { text: 'tiger' }, { text: 'bear' }, { text: 'rabbit' },
    { text: 'horse' }, { text: 'monkey' }, { text: 'snake' }, { text: 'frog' },
    { text: 'owl' }, { text: 'shark' }, { text: 'whale' }, { text: 'fox' },
    { text: 'zebra', difficulty: 'MEDIUM' }, { text: 'panda' }, { text: 'koala', difficulty: 'MEDIUM' },
    { text: 'squirrel', difficulty: 'MEDIUM' }, { text: 'peacock', difficulty: 'MEDIUM' },
    { text: 'flamingo', difficulty: 'MEDIUM' }, { text: 'camel', difficulty: 'MEDIUM' },
    { text: 'seahorse', difficulty: 'HARD' }, { text: 'chameleon', difficulty: 'HARD' },
    { text: 'platypus', difficulty: 'HARD' }, { text: 'jellyfish', difficulty: 'HARD' },
    { text: 'scorpion', difficulty: 'HARD' }, { text: 'porcupine', difficulty: 'HARD' },
    { text: 'walrus', difficulty: 'MEDIUM' }, { text: 'ostrich', difficulty: 'MEDIUM' },
  ],
  FOOD: [
    { text: 'pizza' }, { text: 'burger' }, { text: 'sushi', difficulty: 'MEDIUM' },
    { text: 'spaghetti', difficulty: 'MEDIUM' }, { text: 'pancake' }, { text: 'avocado', difficulty: 'MEDIUM' },
    { text: 'croissant', difficulty: 'HARD' }, { text: 'ice cream' }, { text: 'watermelon' },
    { text: 'hamburger' }, { text: 'pineapple', difficulty: 'MEDIUM' }, { text: 'dumpling', difficulty: 'HARD' },
    { text: 'apple' }, { text: 'banana' }, { text: 'carrot' }, { text: 'bread' },
    { text: 'cheese' }, { text: 'egg' }, { text: 'donut' }, { text: 'cookie' },
    { text: 'hotdog' }, { text: 'taco', difficulty: 'MEDIUM' }, { text: 'popcorn' },
    { text: 'sandwich' }, { text: 'strawberry', difficulty: 'MEDIUM' }, { text: 'cupcake' },
    { text: 'noodles', difficulty: 'MEDIUM' }, { text: 'pretzel', difficulty: 'MEDIUM' },
    { text: 'lollipop' }, { text: 'lemonade', difficulty: 'MEDIUM' }, { text: 'mushroom', difficulty: 'MEDIUM' },
    { text: 'broccoli', difficulty: 'MEDIUM' }, { text: 'pineapple pizza', difficulty: 'HARD' },
    { text: 'spaghetti and meatballs', difficulty: 'HARD' }, { text: 'gingerbread', difficulty: 'HARD' },
    { text: 'waffle' }, { text: 'cherry' }, { text: 'grapes' }, { text: 'pumpkin', difficulty: 'MEDIUM' },
  ],
  MOVIES: [
    { text: 'titanic', difficulty: 'MEDIUM' }, { text: 'avatar', difficulty: 'MEDIUM' },
    { text: 'frozen' }, { text: 'jaws' }, { text: 'gladiator', difficulty: 'HARD' },
    { text: 'inception', difficulty: 'HARD' }, { text: 'shrek' }, { text: 'up' },
    { text: 'matrix', difficulty: 'MEDIUM' }, { text: 'jurassic park', difficulty: 'HARD' },
    { text: 'batman' }, { text: 'superman' }, { text: 'spider-man', difficulty: 'MEDIUM' },
    { text: 'star wars', difficulty: 'MEDIUM' }, { text: 'harry potter', difficulty: 'MEDIUM' },
    { text: 'toy story', difficulty: 'MEDIUM' }, { text: 'the lion king', difficulty: 'MEDIUM' },
    { text: 'finding nemo', difficulty: 'MEDIUM' }, { text: 'cars' }, { text: 'aladdin', difficulty: 'MEDIUM' },
    { text: 'ghostbusters', difficulty: 'HARD' }, { text: 'king kong', difficulty: 'MEDIUM' },
    { text: 'pinocchio', difficulty: 'HARD' }, { text: 'the avengers', difficulty: 'HARD' },
    { text: 'ratatouille', difficulty: 'HARD' }, { text: 'wall-e', difficulty: 'MEDIUM' },
    { text: 'moana', difficulty: 'MEDIUM' }, { text: 'coco', difficulty: 'MEDIUM' },
    { text: 'iron man', difficulty: 'MEDIUM' }, { text: 'the godfather', difficulty: 'HARD' },
  ],
  OBJECTS: [
    { text: 'umbrella' }, { text: 'guitar' }, { text: 'telescope', difficulty: 'MEDIUM' },
    { text: 'scissors' }, { text: 'lighthouse', difficulty: 'MEDIUM' }, { text: 'anchor' },
    { text: 'compass', difficulty: 'MEDIUM' }, { text: 'hourglass', difficulty: 'HARD' },
    { text: 'ladder' }, { text: 'parachute', difficulty: 'HARD' }, { text: 'toothbrush' },
    { text: 'clock' }, { text: 'chair' }, { text: 'candle' }, { text: 'balloon' },
    { text: 'glasses' }, { text: 'hammer' }, { text: 'key' }, { text: 'bucket' },
    { text: 'camera' }, { text: 'crown' }, { text: 'pencil' }, { text: 'book' },
    { text: 'kite' }, { text: 'mirror' }, { text: 'bell' }, { text: 'boot' },
    { text: 'magnet', difficulty: 'MEDIUM' }, { text: 'wheelchair', difficulty: 'MEDIUM' },
    { text: 'binoculars', difficulty: 'HARD' }, { text: 'chandelier', difficulty: 'HARD' },
    { text: 'wheelbarrow', difficulty: 'HARD' }, { text: 'fire extinguisher', difficulty: 'HARD' },
    { text: 'stethoscope', difficulty: 'HARD' }, { text: 'sunglasses' }, { text: 'backpack' },
    { text: 'shovel', difficulty: 'MEDIUM' }, { text: 'trophy', difficulty: 'MEDIUM' }, { text: 'lantern', difficulty: 'MEDIUM' },
  ],
  TECHNOLOGY: [
    { text: 'robot' }, { text: 'laptop' }, { text: 'satellite', difficulty: 'HARD' },
    { text: 'keyboard' }, { text: 'headphones', difficulty: 'MEDIUM' }, { text: 'router', difficulty: 'MEDIUM' },
    { text: 'drone' }, { text: 'microchip', difficulty: 'HARD' }, { text: 'joystick', difficulty: 'MEDIUM' },
    { text: 'smartphone', difficulty: 'MEDIUM' }, { text: 'printer' },
    { text: 'computer' }, { text: 'mouse' }, { text: 'battery' }, { text: 'camera' },
    { text: 'television' }, { text: 'radio' }, { text: 'speaker' }, { text: 'charger' },
    { text: 'lightbulb' }, { text: 'calculator', difficulty: 'MEDIUM' }, { text: 'microphone', difficulty: 'MEDIUM' },
    { text: 'flashlight', difficulty: 'MEDIUM' }, { text: 'antenna', difficulty: 'MEDIUM' },
    { text: 'server', difficulty: 'HARD' }, { text: 'motherboard', difficulty: 'HARD' },
    { text: 'processor', difficulty: 'HARD' }, { text: 'smartwatch', difficulty: 'MEDIUM' },
    { text: 'game console', difficulty: 'MEDIUM' }, { text: 'virtual reality', difficulty: 'HARD' },
    { text: 'usb drive', difficulty: 'MEDIUM' }, { text: 'webcam', difficulty: 'MEDIUM' },
  ],
  COUNTRIES: [
    { text: 'japan' }, { text: 'brazil' }, { text: 'egypt', difficulty: 'MEDIUM' },
    { text: 'australia', difficulty: 'MEDIUM' }, { text: 'iceland', difficulty: 'HARD' },
    { text: 'mexico' }, { text: 'canada' }, { text: 'switzerland', difficulty: 'HARD' },
    { text: 'india' }, { text: 'argentina', difficulty: 'MEDIUM' },
    { text: 'france' }, { text: 'italy' }, { text: 'spain' }, { text: 'china' },
    { text: 'germany', difficulty: 'MEDIUM' }, { text: 'russia', difficulty: 'MEDIUM' },
    { text: 'england' }, { text: 'greece', difficulty: 'MEDIUM' }, { text: 'turkey', difficulty: 'MEDIUM' },
    { text: 'uzbekistan', difficulty: 'HARD' }, { text: 'south korea', difficulty: 'MEDIUM' },
    { text: 'thailand', difficulty: 'MEDIUM' }, { text: 'portugal', difficulty: 'MEDIUM' },
    { text: 'norway', difficulty: 'MEDIUM' }, { text: 'ireland', difficulty: 'MEDIUM' },
    { text: 'netherlands', difficulty: 'HARD' }, { text: 'indonesia', difficulty: 'HARD' },
    { text: 'kazakhstan', difficulty: 'HARD' }, { text: 'morocco', difficulty: 'HARD' },
    { text: 'united states', difficulty: 'MEDIUM' }, { text: 'saudi arabia', difficulty: 'HARD' },
  ],
  SPORTS: [
    { text: 'soccer' }, { text: 'tennis' }, { text: 'boxing', difficulty: 'MEDIUM' },
    { text: 'skiing', difficulty: 'MEDIUM' }, { text: 'surfing', difficulty: 'MEDIUM' },
    { text: 'basketball' }, { text: 'archery', difficulty: 'HARD' }, { text: 'fencing', difficulty: 'HARD' },
    { text: 'cycling' }, { text: 'volleyball', difficulty: 'MEDIUM' },
    { text: 'football' }, { text: 'baseball' }, { text: 'golf' }, { text: 'swimming' },
    { text: 'running' }, { text: 'skating' }, { text: 'bowling', difficulty: 'MEDIUM' },
    { text: 'karate', difficulty: 'MEDIUM' }, { text: 'wrestling', difficulty: 'MEDIUM' },
    { text: 'hockey', difficulty: 'MEDIUM' }, { text: 'cricket', difficulty: 'MEDIUM' },
    { text: 'badminton', difficulty: 'MEDIUM' }, { text: 'skateboarding', difficulty: 'MEDIUM' },
    { text: 'snowboarding', difficulty: 'HARD' }, { text: 'gymnastics', difficulty: 'HARD' },
    { text: 'rock climbing', difficulty: 'HARD' }, { text: 'weightlifting', difficulty: 'HARD' },
    { text: 'horse racing', difficulty: 'HARD' }, { text: 'table tennis', difficulty: 'MEDIUM' },
    { text: 'ping pong', difficulty: 'MEDIUM' }, { text: 'darts', difficulty: 'MEDIUM' },
  ],
};

// A small multilingual sample to demonstrate the structure; production would
// import full per-language CSVs into the same table.
const RU: Partial<Record<WordCategory, Seed[]>> = {
  ANIMALS: [{ text: 'кошка' }, { text: 'собака' }, { text: 'слон', difficulty: 'MEDIUM' }],
  FOOD: [{ text: 'пицца' }, { text: 'суши', difficulty: 'MEDIUM' }, { text: 'блины' }],
};
const ES: Partial<Record<WordCategory, Seed[]>> = {
  ANIMALS: [{ text: 'gato' }, { text: 'perro' }, { text: 'elefante', difficulty: 'MEDIUM' }],
  FOOD: [{ text: 'pizza' }, { text: 'paella', difficulty: 'MEDIUM' }, { text: 'tortilla' }],
};

async function seedLanguage(language: Language, table: Partial<Record<WordCategory, Seed[]>>) {
  let count = 0;
  for (const [category, words] of Object.entries(table)) {
    for (const w of words ?? []) {
      await prisma.word.upsert({
        where: { text_language: { text: w.text, language } },
        update: { category: category as WordCategory, difficulty: w.difficulty ?? 'EASY' },
        create: {
          text: w.text,
          language,
          category: category as WordCategory,
          difficulty: w.difficulty ?? 'EASY',
        },
      });
      count++;
    }
  }
  return count;
}

async function main() {
  const en = await seedLanguage(Language.en, EN);
  const ru = await seedLanguage(Language.ru, RU);
  const es = await seedLanguage(Language.es, ES);
  console.log(`Seeded words — en:${en} ru:${ru} es:${es}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
