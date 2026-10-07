# Campus Customs — Design Notes (Problem 10)

The direction was **"Yale heritage × modern apparel store"**: something that feels like a premium collegiate shop, not a generic e-commerce template.

## Main design changes

- **A real color system.** Yale navy (`#00356b`) is the brand color, used for headings, buttons, prices, and the logo, with a deeper navy for the top strip, footer, chat header, and the story section. Most of the page sits on a warm off-white (`#fbf8f2`) with slightly darker cream panels and warm sand borders instead of cold gray. A muted brass color is used only for small labels ("Show your Yale pride", "Residential colleges"), so the site isn't wall-to-wall blue.
- **Typography with character.** Headings use **Cormorant Garamond**, a classic serif that feels like a university crest or an old campus bookstore sign. Body text, buttons, and filters use **Inter**, which is clean and easy to scan. Small uppercase labels with wide letter spacing give the "heritage" feel. Both fonts are bundled with the site, so nothing is loaded from Google.
- **Home page rebuilt around "Make Yale feel like home."** It's now the hero headline (with *home.* in italic). Next to it is a large photo of a real product with its name and price tag, a second overlapping product photo, and a round "Yale · New Haven" seal. Under the hero a navy ribbon lists what we carry, followed by "Shop by category" photo tiles and three collections:
  - **Yale Classics:** 14 heritage pieces (Big YALE, Boola Boola, vintage bulldogs, Reverse Weave)
  - **Rep Your College:** 19 residential-college items, matched by college name
  - **Game Day:** 36 sports and The Game items

  The collections are rules on real catalogue names, not hand-picked lists, and each "Shop …" button opens the Products page filtered to that collection. The page ends with the "Make Yale Feel Like Home" story on a deep navy background.
- **Photography first.** Every product photo sits on a cream tile in a taller 4:5 frame, like a clothing store. I also improved the backend image cleanup: it now removes leftover dark specks and faint gray edges, so every photo blends cleanly into the cream instead of showing a white box.
- **Consistent pieces.** There are three corner sizes (10/16/24px), pill-shaped buttons in three styles (solid navy, outline, light), soft shadows only on hover or floating things, and the same card everywhere (Products, Home, Favorites, chat results).
- **Small, quiet interactions.** Photos zoom slightly on hover, and a "View details" label slides up on cards. The heart pops when you save something, buttons lift a little and press down when clicked, nav links get an underline that slides in, and the chat panel and filter drawer fade in. Everything is short and smooth, and it's turned off for people who set "reduce motion" on their device.
- **Restyled pages.**
  - **Products:** a cream banner and a white filter card.
  - **Product page:** a large photo panel, a serif title, the price with a "Save to favorites" button, and a clear size grid with sold-out sizes dashed and crossed out. I also changed "Colors" to "Colors in this design", because those are the colors on the item, not options to pick.
  - **Favorites:** a new empty state: "Start building your Yale collection", with a button to browse and one to start with Yale Classics.
- **The chat belongs to the store now.** The launcher says "Ask Campus Customs". The panel has a navy header with the same shield monogram as the logo, cream messages, brass typing dots, and product cards inside the chat that look like small versions of the store's product cards.
- **Responsive.** I checked phone width: two-column product grids, stacked hero buttons, the menu in a dropdown, filters in a full-screen panel, and no sideways scrolling.

## Why it feels more distinctive

Most student stores look like a template with a blue header. The serif plus cream combination, the shield logo, the seal, the brass labels, and the italic "home." make it feel like a heritage brand, closer to a campus bookstore or a premium outfitter. Building the hero around "Make Yale feel like home" ties the look to our story about belonging, not just "Yale stuff for sale". The collections use names that mean something at Yale (residential colleges, The Game), which a generic store wouldn't have.

## How it helps people browse, shop, and stay engaged

- **Faster browsing:** big, consistent photos and an easy-to-scan card (category, name, short description, price) let shoppers compare quickly. The collections give people a starting point if they don't know what they want ("I'm in Pierson", "I'm going to The Game").
- **Clear actions:** the heart is always in the same corner, the main button is always solid navy, and sold-out sizes are obvious, so there's less guessing.
- **Reasons to come back:** the Favorites empty state invites people to start a collection. The chat looks like part of the store, so people are more likely to trust it and use it, and its results land on the page as normal product cards.
- **Nothing broke:** I re-tested login and logout, saved favorites, saved chat history, filters, the product page, and chat searches after the redesign, and they all still work.
