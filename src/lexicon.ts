export interface LexiconExample {
    sh: string;
    en: string;
}

export type PartOfSpeech =
    | "Noun"
    | "Verb"
    | "Adjective"
    | "Adverb"
    | "Pronoun"
    | "Article"
    | "Preposition"
    | "Particle"
    | "Interjection"
    | "Contraction"
    | "Phrase"
    | "Proper Noun"
    | "Symbol"
    | "Abbreviation"
    | "Noun/Verb"
    | "";

export type Formality = "Formal" | "Informal" | "Neutral";

export interface RawLexiconEntry {
    word: string;
    english: string;
    pos: PartOfSpeech;
    category: string;
    formality: Formality;
    notes: string;
    examples: LexiconExample[];
}

export type VerbClass = "everyday" | "governmental" | "physical" | "irregular";

const IRREGULAR_VERB_OVERRIDES = new Set<string>(["spræk", "æfi"]);

function classifyVerb(word: string): VerbClass {
    if (IRREGULAR_VERB_OVERRIDES.has(word)) return "irregular";
    if (word.endsWith("ørn")) return "governmental";
    if (word.endsWith("æk")) return "physical";
    if (word.endsWith("æ")) return "everyday";
    return "irregular";
}

export interface LexiconEntry extends RawLexiconEntry {
    verbClass?: VerbClass;
    englishGlosses: string[];
    deprecated: boolean;
}

export type Person = "1sg" | "2sg" | "2sg_formal" | "3sg" | "1pl" | "2pl" | "3pl";
export type Tense = "past" | "present" | "future";
export type GrammaticalCase = "nom" | "acc" | "gen";

export interface PronounForms {
    nom: string;
    acc: string;
    gen: string;
}

export const INSTITUTIONAL_TYPE_WORDS = new Set([
    "prøspæk", // republic
    "pølænsíne", // province
    "strøvøkagørn", // agency (formal)
    "strøvøksi", // city
    "kømpæni", // company
    "strøvørnstrøn", // government
    "strøværdæk", // military
    "strøvøkhøs", // legislative house
]);

export const PRONOUNS: Record<Person, PronounForms> = {
    "1sg": { nom: "da", acc: "dam", gen: "mør" },
    "2sg": { nom: "di", acc: "dim", gen: "dør" },
    "2sg_formal": { nom: "dia", acc: "diam", gen: "døra" },
    "3sg": { nom: "ŋe", acc: "ŋem", gen: "ŋer" },
    "1pl": { nom: "døs", acc: "døsm", gen: "døsr" },
    "2pl": { nom: "diw", acc: "diwm", gen: "diwr" },
    "3pl": { nom: "ŋæw", acc: "ŋæwm", gen: "ŋæwr" },
}

export const THIRD_PERSON_SINGULAR_VARIANTS: Record<
    "masc" | "fem" | "neutral" | "nonliving", PronounForms
> = {
    masc: { nom: "ŋe", acc: "ŋem", gen: "ŋer" },
    fem: { nom: "ŋi", acc: "ŋim", gen: "ŋir" },
    neutral: { nom: "ŋø", acc: "ŋøm", gen: "ŋør" },
    nonliving: { nom: "ve", acc: "vem", gen: "ver" }
};

export const DEMONSTRATIVES = {
    this: "ves",
    that: "vek",
    these: "vesew",
    those: "vekew"
} as const;

export const TO_BE: Record<Person, Record<Tense, string>> = {
    "1sg": { past: "agæk", present: "ag", future: "agøf" },
    "2sg": { past: "dəgæk", present: "dəg", future: "dəgøf" },
    "2sg_formal": { past: "dəgæk", present: "dəg", future: "dəgøf" },
    "3sg": { past: "deæk", present: "de", future: "deøf" },
    "1pl": { past: "agøsæk", present: "agøs", future: "agøsf" },
    "2pl": { past: "nudiwæk", present: "nudiw", future: "nudiwøf" },
    "3pl": { past: "nuŋæk", present: "nuŋ", future: "nuŋøf" }
};

export const PERSON_SUFFIXES: Record<Person, string> = {
    "1sg": "da",
    "2sg": "di",
    "2sg_formal": "di",
    "3sg": "ŋa",
    "1pl": "møs",
    "2pl": "diw",
    "3pl": "ŋæw"
};

export const TENSE_MARKERS: Record<Tense, string> = {
    past: "æk",
    present: "",
    future: "øf"
};

export const NOUN_CASE_SUFFIXES: Record<GrammaticalCase, string> = {
    nom: "",
    acc: "əm",
    gen: "lu"
};

export const GENDER_SUFFIXES = {
    masc: "on",
    fem: "en",
    neutral: "an",
    sacred: "æsh"
} as const;

export class Lexicon {
    readonly entries: LexiconEntry[];

    private byShr: Map<string, LexiconEntry[]> = new Map();
    private byEnglish: Map<string, LexiconEntry[]> = new Map();

    constructor(raw: RawLexiconEntry[]) {
        this.entries = raw.map(enrichEntry);
        for (const entry of this.entries) {
            indexByKey(this.byShr, entry.word.toLowerCase(), entry);
            for (const gloss of entry.englishGlosses) {
                indexByKey(this.byEnglish, gloss.toLowerCase(), entry);
            }
        }
    }

    lookupShr(word: string): LexiconEntry[] {
        return this.byShr.get(word.toLowerCase()) ?? [];
    }

    lookupEnglish(word: string): LexiconEntry[] {
        const results = this.byEnglish.get(word.toLowerCase()) ?? [];
        return [...results].sort((a, b) => Number(a.deprecated) - Number(b.deprecated));
    }

    get verbs(): LexiconEntry[] {
        return this.entries.filter(e => e.pos === "Verb");
    }
}

function enrichEntry(raw: RawLexiconEntry): LexiconEntry {
    function isDeprecated(notes: string): boolean {
        return /old form|superseded|deprecated/i.test(notes);
    }
    const entry: LexiconEntry = {
        ...raw,
        englishGlosses: splitEnglishGlosses(raw.english),
        deprecated: isDeprecated(raw.notes)
    };
    if (raw.pos === "Verb") {
        entry.verbClass = classifyVerb(raw.word);
    }
    return entry;
}

function splitEnglishGlosses(english: string): string[] {
    const glosses = new Set<string>();
    const pieces = english.split("/").map((p) => p.replace(/\([^)]*\)/g, "").trim());

    for (const piece of pieces) {
        if (!piece) continue;
        glosses.add(piece);
        if (piece.toLowerCase().startsWith("to ")) {
            glosses.add(piece.slice(3).trim());
        } else {

        }
    }
    return Array.from(glosses);
}

function indexByKey<T>(map: Map<string, T[]>, key: string, value: T): void {
    if (!key) return;
    const bucket = map.get(key);
    if (bucket) {
        bucket.push(value);
    } else {
        map.set(key, [value]);
    }
}

export function buildLexicon(raw: RawLexiconEntry[]): Lexicon {
    return new Lexicon(raw);
}