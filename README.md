# What is this API for?
This is an Official API from the Republic of Shæwraka Digital Service Agency Strø. that allows anyone to translate to and from our language, Shæwrakin.

If you want to look up words yourself, please consider checking out the [Shæwrakin Lexicon](https://albinofoxgithub.github.io/ShaewrakanLexicon/).

### Note
This API is currently under development. It will translate most text correctly, but may not be 100% accurate. If you are concerned about being completely accurate in your translations, we suggest reaching out to us directly ([github@shaewraka.org](mailto:github@shaewraka.org)), or asking a native Shæwrakan.

## How to use API
To use this API, simply sent a `POST` request to the URL.

#### Required Fields
|| en-to-shr | shr-to-en | 
|:---| :---------: | :---------: |
| text | ✅ | ✅ |
| formality | ✅ | ❌ |
| gender | ✅ | ❌ |

Templates have been provided at the bottom of this file.

## Examples
### English to Shæwrakin

To translate text to Shæwrakin from English, send a post request to `https://api.shaewraka.org/en-to-shr`.
#### POST
```js
fetch("https://api.shaewraka.org/en-to-shr", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({text: "official shæwraka API", formality: "formal", gender: "neutral" })
}).then(r => r.json()).then(console.log)
```
#### Response
```json
{
    "english": "official shæwraka API",
    "shaewrakin": "Strøvøkæl shæwraka [API].",
    "words": [
        {
            "shr": "strøvøkæl",
            "englishSource": "official"
        },
        {
            "shr": "shæwraka",
            "englishSource": "shæwraka"
        },
        {
            "shr": "[API]",
            "englishSource": "API",
            "unresolved": true
        }
    ],
    "hasUnresolvedWords": true,
    "wasQuestion": false
}
```

### Shæwrakin to English

To translate text to English from Shæwrakin, send a post request to `https://api.shaewraka.org/shr-to-en`.
#### POST
```js
fetch("https://api.shaewraka.org/shr-to-en", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({text: "Da ag shæwrakin."})
}).then(r => r.json()).then(console.log)
```
#### Response
```json
{
    "shaewrakin": "Da ag shæwrakin.",
    "english": "I am Shæwrakan.",
    "words": [
        {
            "kind": "pronoun",
            "person": "1sg",
            "case": "nom",
            "gloss": "I"
        },
        {
            "kind": "to-be",
            "person": "1sg",
            "tense": "present",
            "gloss": "am"
        },
        {
            "kind": "word",
            "entry": {
                "word": "shæwrakin",
                "english": "Shæwrakan (language)",
                "pos": "Noun",
                "category": "Government & Institutional",
                "formality": "Neutral",
                "notes": "",
                "examples": [
                    {
                        "sh": "Da spræk *shæwrakin*.",
                        "en": "I speak Shæwrakan."
                    }
                ],
                "englishGlosses": [
                    "Shæwrakan"
                ],
                "deprecated": false
            },
            "gloss": "Shæwrakan"
        }
    ],
    "hasUnknownWords": false,
    "wasQuestion": false
}
```

### Templates
#### English to Shæwrakin
```js
fetch("https://api.shaewraka.org/en-to-shr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "your-text-here", formality: "your-text-here", gender: "your-text-here" })
    }).then(r => r.json());
```
#### Shæwrakin to English
```js
fetch("https://api.shaewraka.org/shr-to-en", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "your-text-here" })
    }).then(r => r.json());
```
