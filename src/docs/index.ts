import type { DocsEntry } from '../lib/types';

const wcag = (criterion: string, slug: string): { label: string; url: string } => ({
  label: `WCAG ${criterion}`,
  url: `https://www.w3.org/WAI/WCAG21/Understanding/${slug}.html`,
});

/**
 * Entries are keyed by rule id. Rules without an entry fall back to the
 * scanner's own summary, clearly marked as such. See CONTRIBUTING.md for the
 * voice and how to add one.
 */
export const DOCS: Record<string, DocsEntry> = {
  'image-alt': {
    summary: `Add an alt attribute that describes the image, or alt="" if it's purely decorative.`,
    explanation: [
      `A screen reader can't see an image. With no alt attribute, it falls back to reading the file name, so someone hears "logo-final-v2 dot png" instead of "Acme Corp." That's noise, not information.`,
      `The right text depends on the job the image is doing. If it carries meaning, describe the meaning, not the picture: "Revenue rose 40% in Q3", not "line chart". If it's purely decorative and the page reads fine without it, give it an empty alt="" so screen readers skip it. The one thing that's always wrong is leaving the attribute off, which just leaves the reader guessing.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Informative vs decorative',
        before: '<img src="logo-final-v2.png">\n<img src="swirl-divider.png">',
        after: '<img src="logo-final-v2.png" alt="Acme Corp">\n<img src="swirl-divider.png" alt="">',
      },
      {
        label: 'Image used as a link',
        before: '<a href="/cart"><img src="cart.svg"></a>',
        after: '<a href="/cart"><img src="cart.svg" alt="View cart"></a>',
      },
    ],
    references: [wcag('1.1.1 Non-text Content', 'non-text-content')],
  },

  'color-contrast': {
    summary: 'Increase the contrast between the text and its background until it meets the ratio.',
    explanation: [
      `Low-contrast text is hard to read for anyone in bright light, on a cheap screen, or with reduced vision. The rule asks for a contrast ratio of at least 4.5 to 1 for normal text, and 3 to 1 for large text (roughly 24px, or 19px bold).`,
      `Fixing it usually means darkening the text or lightening the background, not both. Reach for a contrast checker rather than eyeballing it, since the ratio is rarely where you'd guess. Pale grey placeholder text and "subtle" link colors on white are the usual offenders.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Too light, then fixed',
        before: '.note { color: #b9b9b9; background: #ffffff; } /* 1.9:1 */',
        after: '.note { color: #595959; background: #ffffff; } /* 7:1 */',
      },
    ],
    references: [wcag('1.4.3 Contrast (Minimum)', 'contrast-minimum')],
  },

  label: {
    summary: 'Give the input a label so people know what to type and screen readers can announce it.',
    explanation: [
      `A bare input is a mystery to a screen reader: it announces "edit text" with no hint of what it's for. A visible <label> tied to the input fixes that, and as a bonus it makes the label clickable, which gives everyone a bigger target.`,
      `Connect them with for and id. If your design has no room for a visible label, a placeholder is not a substitute (it disappears on focus and fails contrast); use aria-label instead, but a real visible label is almost always better.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Visible label (preferred)',
        before: '<input type="email" placeholder="Email">',
        after: '<label for="email">Email</label>\n<input id="email" type="email">',
      },
      {
        label: 'No visible label by design',
        before: '<input type="search">',
        after: '<input type="search" aria-label="Search products">',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'link-name': {
    summary: 'Give the link text that describes where it goes.',
    explanation: [
      `Screen reader users often pull up a list of all links on a page to navigate. A link that reads "click here" or has no text at all (an icon-only link) is useless in that list, since there's no context.`,
      `Put the destination in the link text. If the link is just an icon, add an aria-label, or include visually hidden text. Avoid repeating "read more" across a dozen links; make each one say what it leads to.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Icon-only link',
        before: '<a href="/profile"><svg>...</svg></a>',
        after: '<a href="/profile" aria-label="Your profile"><svg aria-hidden="true">...</svg></a>',
      },
      {
        label: 'Vague text',
        before: '<a href="/report.pdf">Click here</a>',
        after: '<a href="/report.pdf">Download the annual report (PDF)</a>',
      },
    ],
    references: [wcag('2.4.4 Link Purpose', 'link-purpose-in-context')],
  },

  'button-name': {
    summary: 'Give the button text or an accessible label so its purpose is announced.',
    explanation: [
      `A button with no text, common when it's just an icon, gives a screen reader nothing to announce beyond "button". The user has no idea whether it closes, deletes, or submits.`,
      `If the button shows text, you're done. If it's an icon, add an aria-label describing the action, and hide the decorative icon from the accessibility tree with aria-hidden="true".`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Icon button',
        before: '<button><svg>...</svg></button>',
        after: '<button aria-label="Close dialog"><svg aria-hidden="true">...</svg></button>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'heading-order': {
    summary: "Don't skip heading levels; step down one at a time (h2 after h1, not h4).",
    explanation: [
      `Headings are the table of contents a screen reader user navigates by. When levels jump around, the document outline stops making sense, like a book that goes from chapter 1 straight to section 1.3.4.`,
      `Pick heading levels by structure, not by how big you want the text to look. If you need a smaller heading visually, keep the correct level and style it with CSS.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Skipped level',
        before: '<h1>Pricing</h1>\n<h4>Starter plan</h4>',
        after: '<h1>Pricing</h1>\n<h2>Starter plan</h2>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'empty-heading': {
    summary: 'Either give the heading text, or remove the heading tag.',
    explanation: [
      `An empty <h2> still shows up in the screen reader's heading list, as a blank entry that leads nowhere. It's usually left behind by a layout tweak or an icon that replaced the text.`,
      `If the heading is meaningful, give it words. If it was only there for spacing or an icon, use a <div> with CSS instead so it doesn't pollute the outline.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Empty, then fixed',
        before: '<h2></h2>\n<h2><svg>...</svg></h2>',
        after: '<h2>Latest articles</h2>\n<div class="icon"><svg aria-hidden="true">...</svg></div>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'html-has-lang': {
    summary: 'Add a lang attribute to the <html> element.',
    explanation: [
      `The lang attribute tells screen readers which language to speak the page in. Without it, a French page might be read aloud with English pronunciation rules, which can be unintelligible.`,
      `Set it once on the root element using a valid code: en for English, en-GB for British English, fr for French, and so on.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<html>',
        after: '<html lang="en">',
      },
    ],
    references: [wcag('3.1.1 Language of Page', 'language-of-page')],
  },

  'document-title': {
    summary: 'Give the page a unique, descriptive <title>.',
    explanation: [
      `The title is the first thing a screen reader announces when a page loads, and it's what labels the browser tab and bookmark. A missing or generic title ("Untitled", "React App") leaves users unsure of where they are.`,
      `Lead with the specific page, then the site: "Checkout - Acme" rather than "Acme - Checkout". Make each page's title distinct.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<title>React App</title>',
        after: '<title>Checkout - Acme</title>',
      },
    ],
    references: [wcag('2.4.2 Page Titled', 'page-titled')],
  },

  region: {
    summary: 'Wrap the main content in landmark regions so users can jump straight to it.',
    explanation: [
      `Screen reader users navigate by landmarks the way sighted users scan a page. When content sits outside any landmark, it can't be reached that way, and the user has to wade through everything linearly.`,
      `Use the semantic elements: <header>, <nav>, <main>, <footer>. At minimum, put the primary content inside a single <main>. These also replace a pile of <div>s with meaning.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Divs, then landmarks',
        before: '<div class="content">\n  <div class="articles">...</div>\n</div>',
        after: '<main>\n  <section class="articles">...</section>\n</main>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  list: {
    summary: 'Put only <li> elements directly inside <ul> and <ol>.',
    explanation: [
      `Screen readers announce "list, 5 items" so users know what they're getting into. That count breaks when something other than an <li> (a stray <div>, or a wrapper) sits directly inside the list.`,
      `Keep the structure clean: the direct children of <ul>/<ol> should be <li> elements. Move wrappers and other markup inside the <li>, not between the list and its items.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<ul>\n  <div class="item">One</div>\n  <div class="item">Two</div>\n</ul>',
        after: '<ul>\n  <li class="item">One</li>\n  <li class="item">Two</li>\n</ul>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  listitem: {
    summary: "Wrap the <li> in a <ul> or <ol> so it's recognized as a list item.",
    explanation: [
      `An <li> that isn't directly inside a <ul> or <ol> has no list to belong to. Screen readers may not announce it as a list item at all, and the "list, 3 items" context that helps users orient is lost.`,
      `The fix is structural: make sure every <li> has a <ul> or <ol> as its direct parent. This usually creeps in when a wrapper element lands between the list and its items, or when an <li> gets used on its own for its bullet styling. If you only want the look, style a different element instead.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<div class="menu">\n  <li>Home</li>\n  <li>About</li>\n</div>',
        after: '<ul class="menu">\n  <li>Home</li>\n  <li>About</li>\n</ul>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'nested-interactive': {
    summary: "Pull the inner control out so interactive elements aren't nested inside each other.",
    explanation: [
      `Putting one interactive element inside another, like a <button> inside an <a>, or a checkbox inside a button, confuses both the browser and assistive tech. Screen readers can't tell which control they're on, and keyboard focus and activation become unpredictable.`,
      `Keep one interactive element per control. If two actions need to sit near each other, make them siblings rather than nesting them. A common offender is a clickable card (a link) that also holds a button; split them so neither lives inside the other.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Button inside a link',
        before: '<a href="/post/1">\n  Read post\n  <button>Save</button>\n</a>',
        after: '<div class="card">\n  <a href="/post/1">Read post</a>\n  <button>Save</button>\n</div>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'landmark-one-main': {
    summary: "Wrap the page's primary content in a single <main> element.",
    explanation: [
      `Screen reader users jump straight to the main content with a "skip to main" shortcut that targets the <main> landmark. With no <main>, that shortcut has nowhere to go, so they have to tab past the header and navigation on every page.`,
      `Give the page exactly one <main>, around the primary content but not the header, nav, or footer. One per page is the rule: zero leaves users without the shortcut, and more than one makes "the main content" ambiguous.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<body>\n  <header>...</header>\n  <div id="content">...</div>\n</body>',
        after: '<body>\n  <header>...</header>\n  <main>...</main>\n</body>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'aria-required-attr': {
    summary: "Add the ARIA attributes that the element's role requires.",
    explanation: [
      `Some ARIA roles are incomplete without certain attributes. A role="checkbox" with no aria-checked, or a role="slider" with no aria-valuenow, leaves a screen reader unable to announce the control's state, so the user can't tell whether the box is ticked or where the slider sits.`,
      `When you take on a role, add the attributes it depends on, and keep them current as the state changes. Often the simpler fix is to use the native element (<input type="checkbox">), which carries all of this for free, rather than rebuilding it with ARIA.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Custom checkbox',
        before: '<div role="checkbox">Subscribe</div>',
        after: '<div role="checkbox" aria-checked="false" tabindex="0">Subscribe</div>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'aria-valid-attr-value': {
    summary: 'Correct the ARIA attribute value so it matches what the attribute expects.',
    explanation: [
      `ARIA attributes have defined value types: a set of allowed tokens, a true/false, or a reference to another element's id. When the value doesn't fit, assistive tech ignores it, so the information you meant to convey silently disappears. A frequent case is aria-labelledby pointing at an id that doesn't exist.`,
      `Check two things: that the value is the right type for that attribute, and that any id you reference actually exists and is spelled the same. A mistyped id is the difference between a labeled control and an unlabeled one.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Broken label reference',
        before: '<span id="lbl">Email</span>\n<input aria-labelledby="label">',
        after: '<span id="lbl">Email</span>\n<input aria-labelledby="lbl">',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'duplicate-id': {
    summary: 'Make every id on the page unique so references resolve to the right element.',
    explanation: [
      `When two elements share an id, anything that points at it, a <label for>, an aria-labelledby, an aria-describedby, or an in-page link, resolves to only the first match. The second element silently gets the wrong association or none at all.`,
      `Give each element its own id. This tends to slip in through copy-pasted components or repeated templates, so it's worth checking anywhere the same markup renders more than once on a page.`,
    ].join('\n\n'),
    examples: [
      {
        before:
          '<label for="name">First</label>\n<input id="name">\n<label for="name">Last</label>\n<input id="name">',
        after:
          '<label for="first">First</label>\n<input id="first">\n<label for="last">Last</label>\n<input id="last">',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'meta-viewport': {
    summary: 'Remove user-scalable=no (and any low maximum-scale) so people can zoom the page.',
    explanation: [
      `A viewport meta tag with user-scalable=no, or a maximum-scale of 1, stops people pinch-zooming. Anyone who relies on magnification to read small text is locked out, which hurts most on the small screens where zoom matters.`,
      `Let users scale the page. Keep width=device-width, drop user-scalable=no, and don't cap maximum-scale below 2. If the layout breaks when zoomed, that's a responsive-design fix, not a reason to disable zoom.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">',
        after: '<meta name="viewport" content="width=device-width, initial-scale=1">',
      },
    ],
    references: [wcag('1.4.4 Resize Text', 'resize-text')],
  },

  'frame-title': {
    summary: 'Add a title attribute to the <iframe> describing what it contains.',
    explanation: [
      `Screen reader users can pull up a list of frames to move between them, the same way they do with links and headings. A frame with no title shows up as "frame" with no hint of what's inside, so an embedded video, map, or form is just an unlabeled box.`,
      `Give each iframe a short, specific title saying what it holds. If a frame is genuinely empty or purely decorative and carries no content, removing it is better than titling it.`,
    ].join('\n\n'),
    examples: [
      {
        before: '<iframe src="/map"></iframe>',
        after: '<iframe src="/map" title="Map of our office location"></iframe>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  tabindex: {
    summary: 'Remove positive tabindex values and let the DOM order define focus order.',
    explanation: [
      `A tabindex above 0 yanks an element to the front of the tab sequence, ahead of everything with tabindex 0 or none. A single positive value reorders the whole page's keyboard navigation, and it almost never matches the visual order, so keyboard users end up jumping around unpredictably.`,
      `Use tabindex="0" to make a custom element focusable in its natural place, and tabindex="-1" to make something focusable only from script. If the tab order is wrong, fix it by reordering the DOM, not by assigning positive values.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Positive tabindex, then fixed',
        before: '<input tabindex="3">\n<input tabindex="1">\n<input tabindex="2">',
        after: '<input>\n<input>\n<input>',
      },
    ],
    references: [wcag('2.4.3 Focus Order', 'focus-order')],
  },

  'aria-hidden-focus': {
    summary:
      'Make focusable elements inside an aria-hidden container unreachable too — add tabindex="-1" to them, or drop aria-hidden if the content stays visible.',
    explanation: [
      `aria-hidden="true" tells assistive tech to skip a chunk of the page entirely, but it does nothing to keyboard focus. If a link or button inside that container can still be tabbed to, a screen reader user lands on a control that was never announced, then has no idea what they just activated.`,
      `This usually happens with a closed dialog or an off-canvas menu that's left in the DOM and hidden with aria-hidden, while its buttons and links keep their normal tabindex. Either strip focusability from everything inside (tabindex="-1" on each control, restored when the content becomes visible again) or don't hide it from assistive tech in the first place.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Closed modal left focusable',
        before: '<div class="modal" aria-hidden="true">\n  <button class="modal-close">Close</button>\n</div>',
        after:
          '<div class="modal" aria-hidden="true">\n  <button class="modal-close" tabindex="-1">Close</button>\n</div>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'aria-allowed-attr': {
    summary: "Remove the ARIA attribute, or change the role to one that actually supports it.",
    explanation: [
      `Each ARIA role only accepts a specific set of aria-* attributes, and browsers ignore the ones that don't fit. aria-checked on a plain button, for instance, is simply dropped, so a toggle that looks right in the DOM inspector announces nothing about its on/off state.`,
      `Match the attribute to a role that supports it. A button that toggles is really a switch, so give it role="switch" and the aria-checked stays valid instead of getting silently discarded.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Toggle built from a button',
        before: '<button aria-checked="true">Enable notifications</button>',
        after: '<button role="switch" aria-checked="true">Enable notifications</button>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'aria-required-children': {
    summary:
      'Give the role its required child roles — a tablist needs tab children, a list needs listitem children, and so on.',
    explanation: [
      `Some ARIA roles describe a composite widget, and assistive tech expects specific roles nested inside. role="tablist" with plain <div>s inside isn't a widget a screen reader recognizes as tabs; it reads as an unlabeled group with no way to know how many tabs there are or which is selected.`,
      `Add the child role the parent expects. If you're building a tab strip, each clickable tab needs role="tab"; a role="list" needs role="listitem" children. This is easy to miss when the visual design uses styled divs rather than semantic list or table markup.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Tabs missing child role',
        before: '<div role="tablist">\n  <div class="tab">Overview</div>\n  <div class="tab">Details</div>\n</div>',
        after:
          '<div role="tablist">\n  <div class="tab" role="tab">Overview</div>\n  <div class="tab" role="tab">Details</div>\n</div>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'aria-required-parent': {
    summary: 'Wrap the element in the parent role it requires — an option belongs inside a listbox, a listitem inside a list.',
    explanation: [
      `Some roles only make sense inside a specific parent. role="option" sitting on its own, with no role="listbox" wrapping it, leaves a screen reader unable to tell the user they're looking at one choice among several; the "1 of 4" context a real listbox provides is gone.`,
      `Add the missing wrapper role rather than leaving the child role in isolation. This tends to surface when a component library renders the pieces of a widget in a different order than expected, or when only part of a widget got converted to ARIA.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Options without a listbox',
        before: '<div role="option">Red</div>\n<div role="option">Blue</div>',
        after: '<div role="listbox">\n  <div role="option">Red</div>\n  <div role="option">Blue</div>\n</div>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'select-name': {
    summary: 'Give the <select> an accessible name with a <label> or aria-label.',
    explanation: [
      `A <select> with no name announces as just "combo box" — a screen reader user has to guess what they're choosing, then guess again after picking an option to confirm it worked.`,
      `A visible <label for> is the simplest fix and matches how sighted users find the field. If there's no room for a visible label, aria-label works, but keep it short and specific to what the field controls.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Country picker with no name',
        before:
          '<select>\n  <option value="us">United States</option>\n  <option value="ca">Canada</option>\n</select>',
        after:
          '<label for="country">Country</label>\n<select id="country">\n  <option value="us">United States</option>\n  <option value="ca">Canada</option>\n</select>',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'input-button-name': {
    summary: 'Give type="button" inputs a value, and use a real value everywhere else too, not the browser default.',
    explanation: [
      `<input type="submit"> and type="reset"> get a browser-default label ("Submit", "Reset") when value is missing, so they technically pass this check on their own. type="button"> gets no such default: with no value, it announces as just "button", and the user has no idea what pressing it does.`,
      `Set value to the action either way. The default "Submit" is accessible but says nothing about what's being submitted, so a page with three separate forms ends up with three buttons that all sound identical. Write the real action: "Create account", not "Submit".`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Button input with no label',
        before: '<input type="button">',
        after: '<input type="button" value="Create account">',
      },
    ],
    references: [wcag('4.1.2 Name, Role, Value', 'name-role-value')],
  },

  'role-img-alt': {
    summary: 'Give the role="img" element an accessible name with aria-label or aria-labelledby.',
    explanation: [
      `role="img" tells assistive tech to treat an element as a single image, usually a CSS background image or an icon font glyph, rather than reading its contents. Do that without also giving it a name, and the "image" announces as blank, which is worse than not marking it up at all.`,
      `Add aria-label with the same kind of description you'd write for an <img> alt: what the image conveys, not that it's an image. If the element already has visible text that describes it, aria-labelledby pointing at that text works too.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Icon rendered as a background image',
        before: '<div role="img" class="icon-warning"></div>',
        after: '<div role="img" class="icon-warning" aria-label="Warning"></div>',
      },
    ],
    references: [wcag('1.1.1 Non-text Content', 'non-text-content')],
  },

  'svg-img-alt': {
    summary: 'Give the <svg role="img"> an accessible name with a <title> element or aria-label.',
    explanation: [
      `An inline SVG marked role="img" is announced as a single image, the same as an <img>, but SVG has no alt attribute. Without a name it's announced as unlabeled artwork, which is easy to miss since the SVG renders visibly fine either way.`,
      `The most portable fix is a <title> as the SVG's first child, which doubles as a tooltip in most browsers. aria-label works too if you'd rather not touch the SVG's internals.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Icon SVG with no name',
        before: '<svg role="img" viewBox="0 0 24 24">\n  <path d="M12 2L2 22h20z"></path>\n</svg>',
        after:
          '<svg role="img" viewBox="0 0 24 24">\n  <title>Warning</title>\n  <path d="M12 2L2 22h20z"></path>\n</svg>',
      },
    ],
    references: [wcag('1.1.1 Non-text Content', 'non-text-content')],
  },

  'autocomplete-valid': {
    summary: 'Use a real autocomplete token ("given-name", "email", …), not a made-up one.',
    explanation: [
      `The autocomplete attribute has a fixed vocabulary of tokens the browser understands; anything else is silently ignored. That breaks two things at once: browser autofill stops offering to fill the field, and assistive tech that shows an icon or hint based on the field's purpose has nothing to go on.`,
      `Match the token to what the field actually collects: given-name, family-name, email, tel, street-address, and so on are all defined values. A field named firstName in your code doesn't mean autocomplete="fname" is valid; the token vocabulary is independent of your naming.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Made-up token',
        before: '<input type="text" name="firstName" autocomplete="fname">',
        after: '<input type="text" name="firstName" autocomplete="given-name">',
      },
    ],
    references: [wcag('1.3.5 Identify Input Purpose', 'identify-input-purpose')],
  },

  'input-image-alt': {
    summary: 'Add an alt attribute to the image input describing the action it performs.',
    explanation: [
      `<input type="image"> renders a picture that acts as a submit button, so a screen reader announces it the way it would any other button: by its accessible name. With no alt, that name is missing, and depending on the browser the user hears either "button" with nothing else, or the image's file name read out as if it meant something.`,
      `Write the alt the same way you'd label a real button: the action it takes, not a description of the picture. "Search," not "magnifying glass icon."`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Image submit button with no name',
        before: '<form>\n  <input type="image" src="go.png">\n</form>',
        after: '<form>\n  <input type="image" src="go.png" alt="Search">\n</form>',
      },
    ],
    references: [wcag('1.1.1 Non-text Content', 'non-text-content')],
  },

  'td-headers-attr': {
    summary: 'Make each headers attribute point at a <th> id that actually exists in the table.',
    explanation: [
      `The headers attribute on a <td> is how complex tables tell a screen reader which header cells describe it, by id. A typo, or an id left over from a table that got restructured, means the reader announces the wrong header, or none, when the user moves to that cell.`,
      `Keep header ids and headers references in sync. For simple tables, scope="col" or scope="row" is usually enough and avoids the id bookkeeping entirely; reach for headers only when a cell is described by more than one header, like a table with both row and column groupings.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'headers pointing at the wrong id',
        before:
          '<table>\n  <tr><th id="name">Name</th><th id="age">Age</th></tr>\n  <tr><td headers="fullname">Ada</td><td>36</td></tr>\n</table>',
        after:
          '<table>\n  <tr><th id="name">Name</th><th id="age">Age</th></tr>\n  <tr><td headers="name">Ada</td><td headers="age">36</td></tr>\n</table>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'definition-list': {
    summary: "Keep a <dl> to only its <dt>/<dd> pairs (or a wrapping <div>) — move anything else outside it.",
    explanation: [
      `A <dl> is a specific structure: terms and their descriptions. Screen readers rely on that structure to announce "term" and "definition" pairs. Drop an unrelated <p> or heading inside the list and the pairing breaks, so the reader can't tell which text belongs to which.`,
      `Move anything that isn't a <dt>, a <dd>, or a <div> wrapping a <dt>/<dd> pair outside the list. If you need a note or a caption near the list, put it before or after the <dl>, not inside it.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Stray paragraph inside a definition list',
        before: '<dl>\n  <dt>HTML</dt>\n  <dd>HyperText Markup Language</dd>\n  <p>See also: XML</p>\n</dl>',
        after: '<dl>\n  <dt>HTML</dt>\n  <dd>HyperText Markup Language</dd>\n</dl>\n<p>See also: XML</p>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  dlitem: {
    summary: "Wrap the <dt>/<dd> in a <dl> so it's recognized as part of a definition list.",
    explanation: [
      `A <dt> or <dd> outside a <dl> has no list to belong to, the same way an <li> outside a <ul> loses its list context. Assistive tech may not announce it as a term or definition at all, just as unstructured text.`,
      `The fix is structural: put a <dl> around the group of <dt>/<dd> pairs. This usually happens when a wrapper <div> was added between the list and its items, or a glossary was built without the list element in the first place.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Terms outside a definition list',
        before: '<div class="glossary">\n  <dt>HTML</dt>\n  <dd>HyperText Markup Language</dd>\n</div>',
        after: '<dl class="glossary">\n  <dt>HTML</dt>\n  <dd>HyperText Markup Language</dd>\n</dl>',
      },
    ],
    references: [wcag('1.3.1 Info and Relationships', 'info-and-relationships')],
  },

  'area-alt': {
    summary: 'Give every <area> in an image map alt text describing where it leads.',
    explanation: [
      `Each <area> in a <map> is its own link, laid over a region of the image. A screen reader user tabbing through the page hits it like any other link, but with no alt it has no text at all, so it's announced as a blank, unusable link.`,
      `The image the map sits on can have its own alt (describing the image as a whole), but that doesn't cover the individual areas: each one needs its own alt describing where that specific region leads, the same way you'd write link text.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Image map region with no link text',
        before:
          '<img src="map.png" usemap="#m" alt="Office map">\n<map name="m">\n  <area shape="rect" coords="0,0,50,50" href="/a">\n</map>',
        after:
          '<img src="map.png" usemap="#m" alt="Office map">\n<map name="m">\n  <area shape="rect" coords="0,0,50,50" href="/a" alt="Building A">\n</map>',
      },
    ],
    references: [wcag('2.4.4 Link Purpose (In Context)', 'link-purpose-in-context')],
  },

  'image-redundant-alt': {
    summary: "Empty the image's alt if adjacent text already says the same thing, so it isn't announced twice.",
    explanation: [
      `When an image sits next to text that already describes it, non-empty alt makes a screen reader say the same thing twice: "Cart icon, Cart" for a single link. It's not wrong information, just noise that makes every one of these controls slower to listen to.`,
      `If the text is genuinely redundant, set the image's alt to empty so only the text is announced once. If the image conveys something the text doesn't, alt is still the right place for that extra detail. This is common on icon-plus-label buttons and links where the icon is decorative next to a text label.`,
    ].join('\n\n'),
    examples: [
      {
        label: 'Icon and text saying the same thing',
        before: '<a href="/cart"><img src="cart.svg" alt="Cart"> Cart</a>',
        after: '<a href="/cart"><img src="cart.svg" alt=""> Cart</a>',
      },
    ],
    references: [wcag('1.1.1 Non-text Content', 'non-text-content')],
  },
};
