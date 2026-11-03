// Ental og flertal på dansk — i stedet for "2 klasse(r)", som ser ud som en
// halvfærdig skabelon. Bruges overalt, hvor en besked tæller noget op.

/**
 * "1 klasse" / "2 klasser". Tallet står foran, så kaldstedet ikke selv skal
 * huske mellemrummet. Nul er flertal på dansk ("0 klasser").
 */
export function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}
