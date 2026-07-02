import { Lexicon, LexiconEntry, Person, Tense, TO_BE, PRONOUNS, THIRD_PERSON_SINGULAR_VARIANTS, PERSON_SUFFIXES, TENSE_MARKERS } from "./lexicon";
import { ThirdPersonGender } from "./grammar";

const SOV_TRIGGER_CONJUNCTIONS = new Set([
    "dæn", "køn", "søf", "tæ", "mækøn", "ørvæ", "vælun", "fælun",
    "nækøs", "møn", "dønø", "dønørøvøn", "wæræsørn", "pørsuæntørn",
    "mækøn", "søf", "ørbæ"
]);
export function tokenize(sentence: string): string[] {
    const cleaned = sentence
        .replace(/\*/g, "")
        .replace(/¿/g, " ¿ ")
        .replace(/\?/g, " ? ")
        .replace(/[.,!]/g, " ")
        .trim();

    return cleaned.split(/\s+/).filter((t) => t.length > 0);
}

export interface Clause {
    tokens: string[];
    introducedBy?: string;
    isSov: boolean;
}

export function splitClauses(tokens: string[]): Clause[] {
    const clauses: Clause[] = [];
    let current: string[] = [];
    let currentIntroducer: string | undefined = undefined;

    for (const token of tokens) {
        const lower = token.toLowerCase();
        if (SOV_TRIGGER_CONJUNCTIONS.has(lower)) {
            if (current.length > 0) {
                clauses.push({ tokens: current, introducedBy: currentIntroducer, isSov: currentIntroducer !== undefined });
            }
            current = [];
            currentIntroducer = lower;
            continue;
        }
        current.push(token);
    }
    if (current.length > 0) {
        clauses.push({ tokens: current, introducedBy: currentIntroducer, isSov: currentIntroducer !== undefined });
    }
    return clauses;
}

export type AnalyzedWord =
    | { kind: "to-be"; person: Person; tense: Tense; gloss: string }
    | { kind: "pronoun"; person: Person; case: "nom" | "acc" | "gen"; gender?: ThirdPersonGender; gloss: string }
    | { kind: "verb"; entry: LexiconEntry; person: Person; tense: Tense; gloss: string }
    | { kind: "verb-bare"; entry: LexiconEntry; gloss: string }
    | { kind: "word"; entry: LexiconEntry; gloss: string }
    | { kind: "punctuation"; raw: string }
    | { kind: "unknown"; raw: string };

const TO_BE_LOOKUP: Map<string, { person: Person; tense: Tense }> = (() => {
    const map = new Map<string, { person: Person; tense: Tense }>();
    (Object.keys(TO_BE) as Person[]).forEach((person) => {
        (Object.keys(TO_BE[person]) as Tense[]).forEach((tense) => {
            const form = TO_BE[person][tense];
            if (!map.has(form)) map.set(form, { person, tense });
        });
    });
    return map;
})();

interface PronounMatch {
    person: Person;
    case: "nom" | "acc" | "gen";
    gender?: ThirdPersonGender;
}
const PRONOUN_LOOKUP: Map<string, PronounMatch> = (() => {
    const map = new Map<string, PronounMatch>();
    (Object.keys(PRONOUNS) as Person[]).forEach((person) => {
        (["nom", "acc", "gen"] as const).forEach((c) => {
            const form = PRONOUNS[person][c];
            if (!map.has(form)) map.set(form, { person, case: c });
        });
    });
    (Object.keys(THIRD_PERSON_SINGULAR_VARIANTS) as ThirdPersonGender[]).forEach((gender) => {
        (["nom", "acc", "gen"] as const).forEach((c) => {
            const form = THIRD_PERSON_SINGULAR_VARIANTS[gender][c];
            map.set(form, { person: "3sg", case: c, gender });
        });
    });
    return map;
})();

const ENGLISH_PRONOUN_GLOSS: Record<Person, string> = {
    "1sg": "I", "2sg": "you", "2sg_formal": "you", "3sg": "they",
    "1pl": "we", "2pl": "you all", "3pl": "they"
};
const ENGLISH_PRONOUN_GLOSS_BY_GENDER: Record<ThirdPersonGender, string> = {
    masc: "he", fem: "she", neutral: "they", nonliving: "it"
};
const ENGLISH_PRONOUN_GLOSS_ACC: Record<Person, string> = {
    "1sg": "me", "2sg": "you", "2sg_formal": "you", "3sg": "them",
    "1pl": "us", "2pl": "you all", "3pl": "them"
};
const ENGLISH_POSSESSIVE_GLOSS: Record<Person, string> = {
    "1sg": "my", "2sg": "your", "2sg_formal": "your", "3sg": "their",
    "1pl": "our", "2pl": "your (all)", "3pl": "their"
};

function tryAnalyzeAsRegularVerb(token: string, lexicon: Lexicon): { entry: LexiconEntry; person: Person; tense: Tense } | undefined {
    const persons = Object.keys(PERSON_SUFFIXES) as Person[];
    const tenses = Object.keys(TENSE_MARKERS) as Tense[];

    const combos: Array<{ person: Person; tense: Tense; suffix: string }> = [];
    for (const person of persons) {
        for (const tense of tenses) {
            const suffix = PERSON_SUFFIXES[person] + TENSE_MARKERS[tense];
            combos.push({ person, tense, suffix });
        }
    }
    combos.sort((a, b) => b.suffix.length - a.suffix.length);

    for (const combo of combos) {
        if (!combo.suffix) continue;
        if (!token.endsWith(combo.suffix)) continue;
        const candidateRoot = token.slice(0, token.length - combo.suffix.length);
        if (!candidateRoot) continue;
        const matches = lexicon.lookupShr(candidateRoot).filter(
            (e) => e.pos === "Verb" && e.verbClass && e.verbClass !== "irregular"
        );
        if (matches.length > 0) {
            return { entry: matches[0], person: combo.person, tense: combo.tense };
        }
    }
    return undefined;
}

const NOUN_CASE_STRIP = ["lu", "əm"] as const;
const NOUN_GENDER_STRIP = ["æsh", "on", "en", "an"] as const;
const NOUN_PLURAL_STRIP = ["æw", "ew"] as const;

interface NounAnalysis {
    entry: LexiconEntry;
    gloss: string;
}

function tryAnalyzeAsInflectedNoun(token: string, lexicon: Lexicon): NounAnalysis | undefined {
    let stem = token;
    let isPlural = false;
    let caseLabel = "";

    for (const suf of NOUN_CASE_STRIP) {
        if (stem.endsWith(suf)) {
            const candidate = stem.slice(0, -suf.length);
            if (!candidate) continue;
            stem = candidate;
            caseLabel = suf === "əm" ? " (object)" : " (genitive)";
            break;
        }
    }

    for (const suf of NOUN_GENDER_STRIP) {
        if (stem.endsWith(suf)) {
            const candidate = stem.slice(0, -suf.length);
            if (!candidate) continue;
            stem = candidate;
            break;
        }
    }

    for (const suf of NOUN_PLURAL_STRIP) {
        if (stem.endsWith(suf)) {
            const candidate = stem.slice(0, -suf.length);
            if (!candidate) continue;
            const plainMatches = lexicon.lookupShr(candidate).filter(
                (e) => e.pos === "Noun" || e.pos === "Noun/Verb" || e.pos === "Proper Noun"
            );
            if (plainMatches.length > 0) {
                isPlural = true;
                stem = candidate;
                break;
            }
            if (suf === "æw") {
                const withA = candidate + "a";
                const aMatches = lexicon.lookupShr(withA).filter(
                    (e) => e.pos === "Noun" || e.pos === "Noun/Verb" || e.pos === "Proper Noun"
                );
                if (aMatches.length > 0) {
                    isPlural = true;
                    stem = withA;
                    break;
                }
            }
        }
    }

    const rootMatches = lexicon.lookupShr(stem).filter(
        (e) => e.pos === "Noun" || e.pos === "Noun/Verb" || e.pos === "Proper Noun"
    );
    if (rootMatches.length === 0) return undefined;

    const entry = rootMatches[0];
    const baseGloss = entry.englishGlosses[0] ?? entry.english;
    const gloss = isPlural
        ? baseGloss.match(/s$|plural|people/i) ? baseGloss : `${baseGloss} (pl.)`
        : baseGloss + caseLabel;

    return { entry, gloss };
}

export function analyzeWord(token: string, lexicon: Lexicon): AnalyzedWord {
    if (token === "¿" || token === "?") {
        return { kind: "punctuation", raw: token };
    }

    const lower = token.toLowerCase();

    const toBeMatch = TO_BE_LOOKUP.get(lower);
    if (toBeMatch) {
        return { kind: "to-be", person: toBeMatch.person, tense: toBeMatch.tense, gloss: englishToBeGloss(toBeMatch.person, toBeMatch.tense) };
    }

    const pronounMatch = PRONOUN_LOOKUP.get(lower);
    if (pronounMatch) {
        return {
            kind: "pronoun",
            person: pronounMatch.person,
            case: pronounMatch.case,
            gender: pronounMatch.gender,
            gloss: englishPronounGloss(pronounMatch)
        };
    }

    const direct = lexicon.lookupShr(lower);
    if (direct.length > 0) {
        const entry = direct[0];
        if (entry.pos === "Verb" && entry.verbClass === "irregular") {
            const infinitiveGloss = entry.englishGlosses.find((g) => g.toLowerCase().startsWith("to ")) ?? entry.english;
            const bare = infinitiveGloss.toLowerCase().startsWith("to ") ? infinitiveGloss.slice(3).trim() : infinitiveGloss;
            return { kind: "verb-bare", entry, gloss: bare };
        }
        return { kind: "word", entry, gloss: entry.englishGlosses[0] ?? entry.english };
    }

    const regularVerb = tryAnalyzeAsRegularVerb(lower, lexicon);
    if (regularVerb) {
        const infinitiveGloss = regularVerb.entry.englishGlosses.find((g) => g.toLowerCase().startsWith("to ")) ?? regularVerb.entry.english;
        return {
            kind: "verb",
            entry: regularVerb.entry,
            person: regularVerb.person,
            tense: regularVerb.tense,
            gloss: conjugateEnglishGloss(infinitiveGloss, regularVerb.person, regularVerb.tense)
        };
    }

    const nounMatch = tryAnalyzeAsInflectedNoun(lower, lexicon);
    if (nounMatch) {
        return { kind: "word", entry: nounMatch.entry, gloss: nounMatch.gloss };
    }

    return { kind: "unknown", raw: token };
}

const ENGLISH_IRREGULAR_PAST: Record<string, string> = {
    have: "had",
    go: "went",
    come: "came",
    see: "saw",
    give: "gave",
    do: "did",
    make: "made",
    know: "knew",
    think: "thought",
    win: "won",
    lose: "lost",
    speak: "spoke",
    meet: "met",
    become: "became",
    keep: "kept",
    buy: "bought",
    sell: "sold"
};

function thirdPersonPresent(bareInfinitive: string): string {
    if (bareInfinitive === "have") return "has";
    if (bareInfinitive === "be") return "is";
    if (/(s|sh|ch|x|z|o)$/.test(bareInfinitive)) return bareInfinitive + "es";
    if (/[^aeiou]y$/.test(bareInfinitive)) return bareInfinitive.slice(0, -1) + "ies";
    return bareInfinitive + "s";
}

function regularPast(bareInfinitive: string): string {
    if (bareInfinitive.endsWith("e")) return bareInfinitive + "d";
    if (/[^aeiou]y$/.test(bareInfinitive)) return bareInfinitive.slice(0, -1) + "ied";
    return bareInfinitive + "ed";
}

function conjugateEnglishGloss(gloss: string, person: Person, tense: Tense): string {
    const bare = gloss.toLowerCase().startsWith("to ") ? gloss.slice(3).trim() : gloss.trim();

    if (tense === "present") {
        return person === "3sg" ? thirdPersonPresent(bare) : bare;
    }
    if (tense === "past") {
        return ENGLISH_IRREGULAR_PAST[bare] ?? regularPast(bare);
    }
    // future
    return `will ${bare}`;
}

function englishToBeGloss(person: Person, tense: Tense): string {
    const beForm: Record<Tense, string> = { past: "was", present: "is", future: "will be" };
    if (tense === "present") {
        if (person === "1sg") return "am";
        if (person === "3sg") return "is";
        return "are";
    }
    if (tense === "past") {
        if (person === "1sg" || person === "3sg") return "was";
        return "were";
    }
    return beForm.future;
}

function englishPronounGloss(match: PronounMatch): string {
    if (match.case === "gen") {
        return ENGLISH_POSSESSIVE_GLOSS[match.person];
    }
    if (match.person === "3sg" && match.gender) {
        const base = ENGLISH_PRONOUN_GLOSS_BY_GENDER[match.gender];
        if (match.case === "acc") {
            return match.gender === "masc" ? "him" : match.gender === "fem" ? "her" : base === "it" ? "it" : "them";
        }
        return base;
    }
    return match.case === "acc" ? ENGLISH_PRONOUN_GLOSS_ACC[match.person] : ENGLISH_PRONOUN_GLOSS[match.person];
}

export interface TranslationResult {
    english: string;
    words: AnalyzedWord[];
    hasUnknownWords: boolean;
    wasQuestion: boolean;
}

export function translateShrToEn(sentence: string, lexicon: Lexicon): TranslationResult {
    const rawTokens = tokenize(sentence);
    const wasQuestion = rawTokens.includes("¿") || rawTokens.includes("?");
    const contentTokens = rawTokens.filter((t) => t !== "¿" && t !== "?");

    const clauses = splitClauses(contentTokens);
    const allAnalyzed: AnalyzedWord[] = [];
    const englishClauses: string[] = [];

    for (const clause of clauses) {
        const analyzed = clause.tokens.map((t) => analyzeWord(t, lexicon));
        allAnalyzed.push(...analyzed);

        let orderedForOutput = analyzed;
        if (clause.isSov) {
            const verbIndex = findLastVerbIndex(analyzed);
            if (verbIndex !== -1 && verbIndex !== 0) {
                const reordered = [...analyzed];
                const [verb] = reordered.splice(verbIndex, 1);
                reordered.splice(1, 0, verb);
                orderedForOutput = reordered;
            }
        }

        const glossWords = orderedForOutput.map(wordToEnglishFragment).filter((w) => w.length > 0);
        let clauseText = glossWords.join(" ");

        if (clause.introducedBy) {
            const connectorGloss = lexicon.lookupShr(clause.introducedBy)[0]?.englishGlosses[0] ?? clause.introducedBy;
            clauseText = `${connectorGloss} ${clauseText}`;
        }
        englishClauses.push(clauseText);
    }

    let english = englishClauses.join(", ");
    english = capitalize(english);
    if (wasQuestion) {
        english = english.replace(/[.]?$/, "") + "?";
    } else {
        english = english.replace(/[?]?$/, "") + ".";
    }

    return {
        english,
        words: allAnalyzed,
        hasUnknownWords: allAnalyzed.some((w) => w.kind === "unknown"),
        wasQuestion,
    };
}

function findLastVerbIndex(words: AnalyzedWord[]): number {
    for (let i = words.length - 1; i >= 0; i--) {
        const kind = words[i].kind;
        if (kind === "to-be" || kind === "verb" || kind === "verb-bare") return i;
    }
    return -1;
}

function wordToEnglishFragment(word: AnalyzedWord): string {
    switch (word.kind) {
        case "to-be":
            return word.gloss;
        case "pronoun":
            return word.gloss;
        case "verb":
            return word.gloss;
        case "verb-bare":
            return word.gloss;
        case "word":
            return word.gloss;
        case "punctuation":
            return "";
        case "unknown":
            return `[${word.raw}]`;
    }
}

function capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}