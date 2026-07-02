import {
    Lexicon,
    LexiconEntry,
    Person,
    Tense,
    GrammaticalCase,
    PRONOUNS,
    THIRD_PERSON_SINGULAR_VARIANTS, INSTITUTIONAL_TYPE_WORDS
} from "./lexicon";
import {
    conjugateVerb,
    conjugateToBe,
    resolvePronoun,
    declineNoun,
    agreeAdjective,
    negationPlacement,
    ThirdPersonGender
} from "./grammar";

export interface TranslateOptions {
    formal: boolean;
    gender?: ThirdPersonGender;
}

const LIVING_CATEGORIES = new Set(["People & Groups", "Animals & Species"]);
const ANIMACY_OVERRIDES: Record<string, boolean> = {
    prøgnsi: false,
    prøgnsiew: false
};

function isLivingEntry(entry: LexiconEntry): boolean {
    if (entry.word in ANIMACY_OVERRIDES) return ANIMACY_OVERRIDES[entry.word];
    return LIVING_CATEGORIES.has(entry.category);
}

const SACRED_WORDS = new Set(["sha", "shæw"]);
function isSacredEntry(entry: LexiconEntry): boolean {
    return SACRED_WORDS.has(entry.word);
}

function detectEnglishPlural(word: string): { isPlural: boolean; singular: string } {
    if (word.endsWith("ies") && word.length > 3) {
        return { isPlural: true, singular: word.slice(0, -3) + "y "};
    }
    if (word.endsWith("es") && /(s|sh|ch|x|z)es$/.test(word)) {
        return { isPlural: true, singular: word.slice(0, -2) };
    }
    if (word.endsWith("s") && word.length > 1 && !word.endsWith("ss")) {
        return { isPlural: true, singular: word.slice(0, -1) };
    }
    return { isPlural: false, singular: word };
}

interface EnglishToken {
    raw: string;
    lower: string;
}

const CONTRACTIONS: Record<string, string> = {
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "won't": "will not",
    "i'm": "i am",
    "i've": "i have",
    "you're": "you are",
    "they're": "they are",
    "we're": "we are",
    "it's": "it is",
    "he's": "he is",
    "she's": "she is"
};

const DEMONSTRATIVES: Record<string, string> = {
    "this": "ves",
    "that": "vek",
    "these": "vesew",
    "those": "vekew"
};

const ENGLISH_INSTITUTIONAL_TYPES = new Set([
    "republic",
    "province",
    "agency",
    "city",
    "company",
    "government",
    "military",
    "department",
    "ministry"
]);

function tryMatchInstitutionalPhrase(
    tokens: EnglishToken[],
    startIdx: number,
    lexicon: Lexicon
): { output: ShrWordOutput[]; consumed: number } | undefined {
    const tok = tokens[startIdx];

    if (!ENGLISH_INSTITUTIONAL_TYPES.has(tok.lower)) return undefined;

    const typeEntries = lexicon.lookupEnglish(tok.lower)
        .filter(e => !e.deprecated && (e.pos === "Noun" || e.pos === "Proper Noun"));
    if (typeEntries.length === 0) return undefined;

    const triggerShr = typeEntries[0].word;

    const rawComponents: EnglishToken[] = [];
    let j = startIdx + 1;
    while (j < tokens.length) {
        const next = tokens[j];
        if (["of", "the", "a", "an"].includes(next.lower)) {
            j++;
            continue;
        }
        const firstChar = next.raw[0];
        const isCapitalised = firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();
        if (!isCapitalised) break;
        rawComponents.push(next);
        j++;
    }

    if (rawComponents.length === 0) return undefined;

    const TYPE_WORDS_EN = new Set(["agency", "service", "digital", "defense", "forces", "house", "congress"]);
    interface Component { raw: EnglishToken; shr: string; isTypeWord: boolean; }
    const allTypeWords: Component[] = [];
    const descriptors: Component[] = [];
    const properNames: Component[] = [];

    for (const comp of rawComponents) {
        const compEntries = lexicon.lookupEnglish(comp.lower).filter(e => !e.deprecated);
        const shr = compEntries.length > 0 ? compEntries[0].word : comp.raw;
        const isTypeWord = TYPE_WORDS_EN.has(comp.lower);
        const isProperName = compEntries.length === 0 || /[æøəíîŋ]/i.test(comp.raw);

        if (isTypeWord && !isProperName) {
            allTypeWords.push({ raw: comp, shr, isTypeWord: true });
        } else if (isProperName) {
            properNames.push({ raw: comp, shr, isTypeWord: false });
        } else {
            descriptors.push({ raw: comp, shr, isTypeWord: false });
        }
    }

    const result: ShrWordOutput[] = [];
    const mostSpecificType = allTypeWords.length > 0 ? allTypeWords[allTypeWords.length - 1] : null;

    if (mostSpecificType) {
        result.push({ shr: mostSpecificType.shr, englishSource: mostSpecificType.raw.raw });
        for (const tw of allTypeWords) {
            if (tw !== mostSpecificType) result.push({ shr: tw.shr, englishSource: tw.raw.raw });
        }
        for (const d of descriptors) result.push({ shr: d.shr, englishSource: d.raw.raw });
        for (const pn of properNames) result.push({ shr: pn.shr, englishSource: pn.raw.raw });
        result.push({ shr: triggerShr, englishSource: tok.raw });
    } else {
        result.push({ shr: triggerShr, englishSource: tok.raw });
        for (const d of descriptors) result.push({ shr: d.shr, englishSource: d.raw.raw });
        for (const pn of properNames) result.push({ shr: pn.shr, englishSource: pn.raw.raw });
    }

    if (result.length > 0) {
        result[0].shr = result[0].shr.charAt(0).toUpperCase() + result[0].shr.slice(1);
    }

    return { output: result, consumed: j - startIdx };
}

function expandContractions(sentence: string): string {
    let result = sentence;
    for (const [contraction, expansion] of Object.entries(CONTRACTIONS)) {
        const re = new RegExp(`\\b${contraction.replace("'", "'")}\\b`, "gi");
        result = result.replace(re, expansion);
    }
    return result;
}

function tokenizeEnglish(sentence: string): EnglishToken[] {
    const expanded = expandContractions(sentence);
    const cleaned = expanded.replace(/[.!]/g, "").trim();
    const words = cleaned.replace(/\?/g, "").trim().split(/\s+/).filter((w) => w.length > 0);
    return words.map((w) => ({ raw: w, lower: w.toLowerCase() }));
}

const ENGLISH_PRONOUN_TO_PERSON: Record<string, Person> = {
    i: "1sg", me: "1sg", my: "1sg", mine: "1sg",
    you: "2sg", your: "2sg", yours: "2sg",
    he: "3sg", him: "3sg", his: "3sg",
    she: "3sg", her: "3sg", hers: "3sg",
    it: "3sg", its: "3sg",
    they: "3sg", them: "3sg", their: "3sg", theirs: "3sg",
    we: "1pl", us: "1pl", our: "1pl", ours: "1pl"
}

const POSSESSIVE_PRONOUNS = new Set(["my", "your", "his", "her", "its", "their", "our", "mine", "yours", "hers", "theirs", "ours"]);
const OBJECT_PRONOUNS = new Set(["me", "him", "her", "it", "them", "us", "you"]);

const ENGLISH_PRONOUN_IMPLIED_GENDER: Record<string, ThirdPersonGender> = {
    he: "masc", him: "masc", his: "masc",
    she: "fem", her: "fem", hers: "fem",
    it: "nonliving", its: "nonliving"
}

const NEGATION_WORDS = new Set(["not", "n't", "no"]);

const FUTURE_AUX = new Set(["will", "shall", "going"]);
const PAST_AUX = new Set(["did", "had", "was", "were"]);
const PRESENT_AUX = new Set(["do", "does", "is", "are", "am"]);

const ARTICLES = new Set(["a", "an", "the"]);

const ENGLISH_IRREGULAR_PAST_TO_BASE: Record<string, string> = {
    had: "have", went: "go", came: "come", saw: "see", gave: "give",
    did: "do", made: "make", knew: "know", thought: "think", won: "win",
    lost: "lose", spoke: "speak", met: "meet", became: "become",
    kept: "keep", bought: "buy", sold: "sell", was: "be", were: "be"
};

function lemmatizeVerb(word: string): string {
    if (word in ENGLISH_IRREGULAR_PAST_TO_BASE) return ENGLISH_IRREGULAR_PAST_TO_BASE[word];
    if (word.endsWith("ing")) {
        const stem = word.slice(0, -3);
        if (stem.length >= 2 && stem[stem.length - 1] === stem[stem.length - 2] && !"aeiou".includes(stem[stem.length - 1])) {
            return stem.slice(0, -1);
        }
        return stem;
    }
    if (word.endsWith("ies")) return word.slice(0, -3) + "y";
    if (word.endsWith("es") && /(s|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
    if (word.endsWith("ed")) {
        const stem = word.slice(0, -2);
        return stem.endsWith("e") ? stem : stem;
    }
    if (word.endsWith("s") && word.length > 1) return word.slice(0, -1);
    return word;
}

export interface ShrWordOutput {
    shr: string;
    englishSource: string;
    unresolved?: boolean;
}

export interface EnToShrResult {
    shaewrakin: string;
    words: ShrWordOutput[];
    hasUnresolvedWords: boolean;
    wasQuestion: boolean;
}

function tryMatchHowAreYou(sentence: string, formal: boolean): string | undefined {
    const normalized = sentence.trim().toLowerCase().replace(/[?.!]/g, "");
    if (normalized === "how are you") {
        const youForm = formal ? "dia" : "di";
        return `¿Høvda ${youForm}?`;
    }
    return undefined;
}

export function translateEnToShr(sentence: string, lexicon: Lexicon, options: TranslateOptions): EnToShrResult {
    const idiomMatch = tryMatchHowAreYou(sentence, options.formal);
    if (idiomMatch) {
        return {
            shaewrakin: idiomMatch,
            words: [{ shr: idiomMatch, englishSource: sentence }],
            hasUnresolvedWords: false,
            wasQuestion: true
        };
    }

    const tokens = tokenizeEnglish(sentence);
    const wasQuestion = sentence.trim().endsWith("?");
    const defaultGender: ThirdPersonGender = options.gender ?? "neutral";

    const output: ShrWordOutput[] = [];

    let subjectPerson: Person | undefined;
    let subjectGender: ThirdPersonGender = defaultGender;
    let pendingNegation = false;
    let skipNextArticle = false;
    let sawVerbOrToBeYet = false;
    let verbWasCopula = false;
    let forcedFutureNext = false;

    let i = 0;
    while (i < tokens.length) {
        const tok = tokens[i];
        if (NEGATION_WORDS.has(tok.lower)) {
            pendingNegation = true;
            i++;
            continue;
        }

        if (tok.lower in DEMONSTRATIVES) {
            output.push({ shr: DEMONSTRATIVES[tok.lower], englishSource: tok.raw });
            i++;
            continue;
        }

        const institutionalMatch = tryMatchInstitutionalPhrase(tokens, i, lexicon);
        if (institutionalMatch) {
            output.push(...institutionalMatch.output);
            i += institutionalMatch.consumed;
            continue;
        }

        if (tok.lower === "of") {
            let k = i + 1;
            while (k < tokens.length && ARTICLES.has(tokens[k].lower)) k++;
            const upcomingIsInstitutional = k < tokens.length && ENGLISH_INSTITUTIONAL_TYPES.has(tokens[k].lower);

            const lastOutput = output[output.length - 1];
            const lastIsInstitutional = lastOutput &&
                INSTITUTIONAL_TYPE_WORDS.has(lastOutput.shr.toLowerCase());

            if (!lastIsInstitutional && !upcomingIsInstitutional) {
                output.push({ shr: "lu", englishSource: tok.raw });
            }

            if (upcomingIsInstitutional) {
                skipNextArticle = true;
            }
            i++;
            continue;
        }

        if (ARTICLES.has(tok.lower)) {
            if (skipNextArticle) {
                skipNextArticle = false;
                i++;
                continue;
            }
            const shrWord = tok.lower === "the" ? "gə" : "a";
            output.push({ shr: shrWord, englishSource: tok.raw });
            i++;
            continue;
        }

        if (PRESENT_AUX.has(tok.lower) || PAST_AUX.has(tok.lower) || tok.lower === "be") {
            const tense = tenseFromAux(tok.lower);
            if (tok.lower === "do" || tok.lower === "does" || tok.lower === "did") {
                i++;
                continue;
            }
            const person = subjectPerson ?? "3sg";
            const beForm = conjugateToBe(person, tense);
            maybeEmitNegation(output, pendingNegation, options.formal, "before-this");
            output.push({ shr: beForm, englishSource: tok.raw });
            maybeEmitNegation(output, pendingNegation, options.formal, "after-this");
            pendingNegation = false;
            sawVerbOrToBeYet = true;
            verbWasCopula = true;
            i++;
            continue;
        }
        if (tok.lower === "will" || tok.lower === "shall") {
            forcedFutureNext = true;
            i++;
            continue;
        }
        if (tok.lower in ENGLISH_PRONOUN_TO_PERSON) {
            let person = ENGLISH_PRONOUN_TO_PERSON[tok.lower];
            const grammaticalCase: GrammaticalCase = POSSESSIVE_PRONOUNS.has(tok.lower)
                ? "gen"
                : OBJECT_PRONOUNS.has(tok.lower) && sawVerbOrToBeYet
                ? "acc"
                    : "nom";

            let gender: ThirdPersonGender | undefined = ENGLISH_PRONOUN_IMPLIED_GENDER[tok.lower];
            if (person === "3sg" && !gender) gender = defaultGender;
            if (tok.lower === "they" || tok.lower === "them" || tok.lower === "their") {
                if (i + 1 < tokens.length && tokens[i + 1].lower === "all") {
                    person = "3pl";
                    i++;
                }
            }

            const formalFlag = person === "2sg" ? options.formal : false;
            const shrWord = resolvePronoun(person, grammaticalCase, { formal: formalFlag, gender });
            output.push({ shr: shrWord, englishSource: tok.raw });
            if (!sawVerbOrToBeYet) {
                subjectPerson = person;
                subjectGender = gender ?? defaultGender;
            }
            i++;
            continue;
        }
        const lemma = lemmatizeVerb(tok.lower);
        const verbEntries = lexicon.lookupEnglish(lemma).filter((e) => e.pos === "Verb" && !e.deprecated);
        if (verbEntries.length > 0 && !sawVerbOrToBeYet) {
            const entry = verbEntries[0];
            const tense: Tense = forcedFutureNext ? "future" : detectTenseFromVerbForm(tok.lower, lemma);
            forcedFutureNext = false;
            const person = subjectPerson ?? "3sg";

            maybeEmitNegation(output, pendingNegation, options.formal, "before-this");
            if (entry.verbClass && entry.verbClass !== "irregular") {
                const conjugated = conjugateVerb({ root: entry.word, verbClass: entry.verbClass, person, tense });
                output.push({ shr: conjugated, englishSource: tok.raw });
            } else {
                output.push({ shr: entry.word, englishSource: tok.raw });
            }
            maybeEmitNegation(output, pendingNegation, options.formal, "after-this");
            pendingNegation = false;
            sawVerbOrToBeYet = true;
            i++;
            continue;
        }
        const direct = lexicon.lookupEnglish(tok.lower).filter(e => !e.deprecated);
        const plural = detectEnglishPlural(tok.lower);

        const lookupWord = direct.length > 0 ? tok.lower : plural.singular;
        const entryMatches = direct.length > 0 ? direct : lexicon.lookupEnglish(lookupWord).filter(e => !e.deprecated);
        const needsExplicitPluralization = direct.length === 0 && plural.isPlural && entryMatches.length > 0;

        if (entryMatches.length > 0) {
            const entry = entryMatches[0];
            const living = isLivingEntry(entry);
            const sacred = isSacredEntry(entry);
            const grammaticalCase: GrammaticalCase = sawVerbOrToBeYet && !verbWasCopula ? "acc" : "nom";
            let resolvedGender: "masc" | "fem" | "neutral" | "sacred" | undefined;
            if (sacred) {
                resolvedGender = "sacred";
            } else if (living && (defaultGender === "masc" || defaultGender === "fem" || defaultGender === "neutral")) {
                resolvedGender = defaultGender;
            }

            if (entry.pos === "Noun" || entry.pos === "Noun/Verb" || entry.pos === "Proper Noun") {
                const declined = declineNoun({
                    root: entry.word,
                    number: needsExplicitPluralization ? "plural" : "singular",
                    grammaticalCase,
                    isLiving: living,
                    gender: resolvedGender
                });
                output.push({ shr: declined, englishSource: tok.raw });
            } else {
                output.push({ shr: entry.word, englishSource: tok.raw });
            }
            i++;
            continue;
        }

        const firstChar = tok.raw[0] ?? "";
        const isCapitalisedToken = firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase() && i > 0;
        if (isCapitalisedToken) {
            output.push({ shr: tok.raw, englishSource: tok.raw });
        } else {
            output.push({ shr: `[${tok.raw}]`, englishSource: tok.raw, unresolved: true });
        }
        i++;
    }

    let shaewrakin = output.map((w) => w.shr).join(" ");
    shaewrakin = capitalize(shaewrakin);
    if (wasQuestion) {
        shaewrakin = `¿${shaewrakin}?`;
    } else {
        shaewrakin = shaewrakin + ".";
    }

    return {
        shaewrakin,
        words: output,
        hasUnresolvedWords: output.some((w) => w.unresolved),
        wasQuestion
    };
}

function tenseFromAux(auxLower: string): Tense {
    if (PAST_AUX.has(auxLower)) return "past";
    if (PRESENT_AUX.has(auxLower)) return "present";
    return "present";
}

function detectTenseFromVerbForm(surfaceForm: string, lemma: string): Tense {
    if (surfaceForm in ENGLISH_IRREGULAR_PAST_TO_BASE) return "past";
    if (surfaceForm.endsWith("ed") && surfaceForm !== lemma) return "past";
    if (surfaceForm.endsWith("ing")) return "present"; // continuous -> present per your collapse decision
    return "present";
}

function maybeEmitNegation(output: ShrWordOutput[], pending: boolean, formal: boolean, position: "before-this" | "after-this") {
    if (!pending) return;
    const placement = negationPlacement(formal);
    if ((placement === "before" && position === "before-this") || (placement === "after" && position === "after-this")) {
        output.push({ shr: "ni", englishSource: "(not)" });
    }
}

function capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}