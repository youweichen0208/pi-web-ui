/** A completed greeting deserves a useful localized label, while a manual
 * session name remains authoritative. This also covers old unnamed chats. */
export function conversationDisplayTitle(title: string, firstMessage: string | undefined, name: string | undefined, messageCount: number, locale: "zh" | "en"): string {
	if (name?.trim()) return name;
	const first = (firstMessage || title).trim();
	if (locale === "zh" && messageCount > 1 && /^(?:hi|hello|hey|你好|您好|嗨|哈喽)[\s!！?？.。~～]*$/iu.test(first)) return "打招呼";
	return title;
}
