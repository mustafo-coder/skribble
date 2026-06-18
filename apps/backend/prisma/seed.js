"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const EN = {
    ANIMALS: [
        { text: 'cat' }, { text: 'dog' }, { text: 'elephant', difficulty: 'MEDIUM' },
        { text: 'giraffe', difficulty: 'MEDIUM' }, { text: 'penguin' }, { text: 'octopus', difficulty: 'HARD' },
        { text: 'kangaroo', difficulty: 'MEDIUM' }, { text: 'butterfly' }, { text: 'rhinoceros', difficulty: 'HARD' },
        { text: 'dolphin' }, { text: 'hedgehog', difficulty: 'HARD' }, { text: 'crocodile', difficulty: 'MEDIUM' },
    ],
    FOOD: [
        { text: 'pizza' }, { text: 'burger' }, { text: 'sushi', difficulty: 'MEDIUM' },
        { text: 'spaghetti', difficulty: 'MEDIUM' }, { text: 'pancake' }, { text: 'avocado', difficulty: 'MEDIUM' },
        { text: 'croissant', difficulty: 'HARD' }, { text: 'ice cream' }, { text: 'watermelon' },
        { text: 'hamburger' }, { text: 'pineapple', difficulty: 'MEDIUM' }, { text: 'dumpling', difficulty: 'HARD' },
    ],
    MOVIES: [
        { text: 'titanic', difficulty: 'MEDIUM' }, { text: 'avatar', difficulty: 'MEDIUM' },
        { text: 'frozen' }, { text: 'jaws' }, { text: 'gladiator', difficulty: 'HARD' },
        { text: 'inception', difficulty: 'HARD' }, { text: 'shrek' }, { text: 'up' },
        { text: 'matrix', difficulty: 'MEDIUM' }, { text: 'jurassic park', difficulty: 'HARD' },
    ],
    OBJECTS: [
        { text: 'umbrella' }, { text: 'guitar' }, { text: 'telescope', difficulty: 'MEDIUM' },
        { text: 'scissors' }, { text: 'lighthouse', difficulty: 'MEDIUM' }, { text: 'anchor' },
        { text: 'compass', difficulty: 'MEDIUM' }, { text: 'hourglass', difficulty: 'HARD' },
        { text: 'ladder' }, { text: 'parachute', difficulty: 'HARD' }, { text: 'toothbrush' },
    ],
    TECHNOLOGY: [
        { text: 'robot' }, { text: 'laptop' }, { text: 'satellite', difficulty: 'HARD' },
        { text: 'keyboard' }, { text: 'headphones', difficulty: 'MEDIUM' }, { text: 'router', difficulty: 'MEDIUM' },
        { text: 'drone' }, { text: 'microchip', difficulty: 'HARD' }, { text: 'joystick', difficulty: 'MEDIUM' },
        { text: 'smartphone', difficulty: 'MEDIUM' }, { text: 'printer' },
    ],
    COUNTRIES: [
        { text: 'japan' }, { text: 'brazil' }, { text: 'egypt', difficulty: 'MEDIUM' },
        { text: 'australia', difficulty: 'MEDIUM' }, { text: 'iceland', difficulty: 'HARD' },
        { text: 'mexico' }, { text: 'canada' }, { text: 'switzerland', difficulty: 'HARD' },
        { text: 'india' }, { text: 'argentina', difficulty: 'MEDIUM' },
    ],
    SPORTS: [
        { text: 'soccer' }, { text: 'tennis' }, { text: 'boxing', difficulty: 'MEDIUM' },
        { text: 'skiing', difficulty: 'MEDIUM' }, { text: 'surfing', difficulty: 'MEDIUM' },
        { text: 'basketball' }, { text: 'archery', difficulty: 'HARD' }, { text: 'fencing', difficulty: 'HARD' },
        { text: 'cycling' }, { text: 'volleyball', difficulty: 'MEDIUM' },
    ],
};
const RU = {
    ANIMALS: [{ text: 'кошка' }, { text: 'собака' }, { text: 'слон', difficulty: 'MEDIUM' }],
    FOOD: [{ text: 'пицца' }, { text: 'суши', difficulty: 'MEDIUM' }, { text: 'блины' }],
};
const ES = {
    ANIMALS: [{ text: 'gato' }, { text: 'perro' }, { text: 'elefante', difficulty: 'MEDIUM' }],
    FOOD: [{ text: 'pizza' }, { text: 'paella', difficulty: 'MEDIUM' }, { text: 'tortilla' }],
};
async function seedLanguage(language, table) {
    let count = 0;
    for (const [category, words] of Object.entries(table)) {
        for (const w of words ?? []) {
            await prisma.word.upsert({
                where: { text_language: { text: w.text, language } },
                update: { category: category, difficulty: w.difficulty ?? 'EASY' },
                create: {
                    text: w.text,
                    language,
                    category: category,
                    difficulty: w.difficulty ?? 'EASY',
                },
            });
            count++;
        }
    }
    return count;
}
async function main() {
    const en = await seedLanguage(client_1.Language.en, EN);
    const ru = await seedLanguage(client_1.Language.ru, RU);
    const es = await seedLanguage(client_1.Language.es, ES);
    console.log(`Seeded words — en:${en} ru:${ru} es:${es}`);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map