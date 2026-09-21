import type { ThemeRegistrationRaw } from 'shiki';

/**
 * The Shiki theme, built from the design's `Code *` variables.
 *
 * Every color below is a CSS custom property rather than a hex, and that is
 * what lets one theme serve both color schemes. Shiki does not parse the
 * color strings in a theme — it copies them into each span's inline `style` —
 * so the token resolves through `light-dark()` in `tokens.css` at paint time,
 * on whichever scheme is in effect. Shiki's own dual-theme mode would also
 * work, but it writes both palettes into every span and needs a second set of
 * CSS rules to choose between them, which is the job `light-dark()` already
 * does everywhere else on the site.
 *
 * ## What the design specifies
 *
 * One sample, in CSS, drawn in all four Code Block frames — light `42:1688`,
 * dark `42:3569`, and the header variant `42:2106`. Its fills are bound to
 * the `Code *` variables, so six roles are spec'd and no more:
 *
 * - comment — green
 * - property name — purple
 * - keyword value (`auto`, `stretch`) — orange
 * - number and function name (`0`, `anchor-size`) — red
 * - type selector (`select`) — yellow
 * - everything else, including punctuation, units and the rest of the
 *   selector — code text
 *
 * No other language appears anywhere in the file, so every scope below that
 * isn't CSS is an extrapolation. The rule used to extrapolate is the one the
 * sample itself follows: **color the semantic payload, leave the syntax
 * plain.** That reads the six roles as:
 *
 * - **green** — comments, and nothing else.
 * - **purple** — the name of a thing being set: CSS property, object or JSON
 *   key, HTML and JSX attribute name, property access.
 * - **orange** — a word the language itself defines: CSS keyword values,
 *   `const` and `return`, `true` and `null`, `this`.
 * - **red** — numbers and function names, together in one color because the
 *   sample gives `0` and `anchor-size` the same red.
 * - **yellow** — a tag or type name: CSS type selector, HTML tag, class and
 *   type names, JSX components.
 * - **code text** — punctuation, operators, units, plain identifiers.
 *
 * ## Where this departs from the frame
 *
 * The sample is hand-colored and not self-consistent, so it cannot be
 * transcribed scope by scope. `stretch` is orange as a keyword value while
 * `self-inline` inside `anchor-size(...)` is plain, though both are keyword
 * values. This theme takes the consistent reading: a keyword value is orange
 * wherever it appears.
 *
 * The unit in `1lh` is the one inconsistency kept. It is plain in the sample
 * while the `1` is red, and that is worth keeping because a unit welded to
 * its number reads as a single value — coloring half of it splits something
 * the eye takes as one token.
 *
 * `::picker` being plain while `select` is yellow is also kept, and it is
 * what fixes yellow's meaning: a tag or type name is yellow, and the rest of
 * the selector syntax — pseudo-elements, classes, ids, attribute selectors —
 * is plain. A stylesheet written in class selectors therefore has a
 * mostly-plain left-hand side, which is what the frame shows.
 *
 * ## The CSS grammar's property list is an allowlist
 *
 * TextMate's CSS grammar recognizes properties from a fixed list, and that
 * list is older than most of what this site writes about: `margin` gets
 * `support.type.property-name`, `position-area` — which the design's own
 * sample uses — gets only `meta.property-name`. Both are purple here for
 * that reason, and the cost is that a *nested* selector picks up the same
 * scope, so `& a { … }` colors the `a` as if it were a property. That is the
 * right way round to be wrong on a site about new CSS: an unrecognized
 * property is guaranteed to appear in a release note, while a nested bare
 * type selector is rarer and merely lands on the wrong color rather than
 * losing one.
 *
 * The value side of an unrecognized declaration can't be rescued here at all.
 * The grammar gives up and emits `: self-block-end span-self-inline-end;` —
 * colon and semicolon included — as a single `meta.property-value` token, so
 * coloring it would color the punctuation the design leaves plain. Those
 * values stay plain until the upstream grammar learns the property.
 *
 * ## Strings
 *
 * The design has no string in it. A CSS sample can avoid them, and nothing
 * else is drawn, so the commonest token in every other language has no
 * specified color and all five hues are already spoken for. It gets
 * `--color-code-blue`, which is derived from two of them rather than picked —
 * `tokens.css` sets out the derivation.
 *
 * ## Font styles
 *
 * Only markdown's own bold and italic set one. Every span in the design is
 * upright at a single weight, so nothing here italicizes a comment or bolds a
 * keyword the way a stock theme would.
 *
 * ## Scope precedence
 *
 * TextMate resolves a token to the most specific matching selector, counting
 * dot-separated segments, so the exceptions below are expressed by being more
 * specific rather than by their order in this array: `keyword.operator` beats
 * `keyword`, `support.type.property-name` beats `support.type`, and
 * `entity.other.attribute-name.css` beats `entity.other.attribute-name`.
 * Adding a rule that is *less* specific than one already here will do
 * nothing, however far down the list it goes.
 */

const text = 'var(--color-code-text)';
const green = 'var(--color-code-green)';
const purple = 'var(--color-code-purple)';
const orange = 'var(--color-code-orange)';
const red = 'var(--color-code-red)';
const yellow = 'var(--color-code-yellow)';
const blue = 'var(--color-code-blue)';

export const codeTheme = {
  name: 'firefox-devs',
  /* Nominal. The palette is mode-dependent at paint time, so neither value is
     true, but Shiki treats the field as required and defaults it to dark. */
  type: 'light',
  fg: text,
  /* The background belongs to `.code-block`, which wraps every block whether
     or not it has variants — see `prose.css`. */
  bg: 'transparent',
  settings: [
    /* Comments */
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: green },
    },

    /* The name of a thing being set */
    {
      scope: [
        'support.type.property-name', // CSS property, JSON key
        'meta.property-name', // a CSS property the grammar doesn't know
        'meta.object-literal.key',
        'variable.other.property', // the `b` in `a.b`
        'variable.other.object.property',
        'entity.other.attribute-name', // HTML and JSX attributes
        'entity.name.tag.yaml', // a YAML key, not a tag
        'punctuation.support.type.property-name', // the quotes on a JSON key
      ],
      settings: { foreground: purple },
    },

    /* Words the language itself defines */
    {
      scope: [
        'keyword',
        'storage',
        'constant.language', // true, false, null, undefined
        'variable.language', // this, super
        'support.constant', // CSS `auto`, `stretch`, named colors
      ],
      settings: { foreground: orange },
    },

    /* Numbers, and the names of functions called */
    {
      scope: [
        'constant.numeric',
        'constant.other.color',
        'constant.character.escape',
        'entity.name.function',
        'support.function',
        'variable.function',
      ],
      settings: { foreground: red },
    },

    /* Tag and type names */
    {
      scope: [
        'entity.name.tag', // HTML tag, CSS type selector
        'entity.name.type',
        'entity.name.class',
        'entity.other.inherited-class',
        'support.class',
        'support.type',
      ],
      settings: { foreground: yellow },
    },

    /* Strings */
    {
      scope: [
        'string',
        'punctuation.definition.string',
        'string.regexp',
        'markup.underline.link',
      ],
      settings: { foreground: blue },
    },

    /* Syntax, which the design leaves plain. Each of these is more specific
       than the rule it overrides, so it wins wherever both match. */
    {
      scope: [
        'punctuation',
        'keyword.operator', // =, =>, +, and CSS combinators
        'keyword.other.unit', // the `lh` in `1lh`
        'variable.parameter',
        'entity.other.attribute-name.css', // attribute, class, id selectors
        'entity.other.attribute-name.pseudo-class.css',
        'entity.other.attribute-name.pseudo-element.css',
        /* The shell grammar scopes every bare argument as an unquoted
           string, which would turn most of a command line into one blue
           run. A word is not a string for having no quotes round it. */
        'string.unquoted',
        /* `${…}` in a template literal is code, so it reads as code. The
           scopes inside it still win where they are more specific. */
        'meta.template.expression',
      ],
      settings: { foreground: text },
    },

    /* Markdown, where bold and italic are the content rather than
       highlighting. A diff's inserted lines share the comment's green, which
       is unambiguous in a diff because nothing else there is green. */
    {
      scope: ['markup.heading', 'entity.name.section'],
      settings: { foreground: purple, fontStyle: 'bold' },
    },
    { scope: 'markup.bold', settings: { fontStyle: 'bold' } },
    { scope: 'markup.italic', settings: { fontStyle: 'italic' } },
    { scope: 'markup.inserted', settings: { foreground: green } },
    { scope: 'markup.deleted', settings: { foreground: red } },
    { scope: 'markup.changed', settings: { foreground: orange } },
  ],
} satisfies ThemeRegistrationRaw;
