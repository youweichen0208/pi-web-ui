/**
 * 修 GFM 自动链接把中文标点吞进 URL 的毛病。
 *
 * remark-gfm 的 autolink literal 扩展是按「空白或 ASCII 标点」来判断一条裸
 * URL 到哪儿结束的，中文的全角标点它不认。于是这么一句：
 *
 *   已经在浏览器里打开了（http://localhost:8787），如果需要重启服务，告诉我。
 *
 * 从 http:// 开始一直到句号全被算进 href，点一下跳到一个 percent-encode 过的
 * 乱码地址，页面直接白屏/黑屏。
 *
 * 这里在 remark-gfm 之后再过一遍树：URL 里出现全角标点或中日韩标点的自动链接，
 * 在第一个这种字符处截断，剩下的部分放回去当普通文本。
 *
 * 两个刻意的边界：
 *   - 只认标点（U+3000–U+303F、U+FF00–U+FFEF），不认汉字。路径里带中文的正常
 *     链接（比如中文维基）不能误伤。
 *   - 只动自动链接。显式写的 [文字](url) 里 URL 跟文字没有后缀关系，跳过——
 *     那是作者自己写的地址，轮不到我们改。
 */

/** mdast 节点里我们会碰到的那几个字段。不引 @types/mdast，省一个依赖。 */
interface MdNode {
	type: string;
	value?: string;
	url?: string;
	children?: MdNode[];
}

/** 全角标点 + 中日韩标点。注意不含汉字。 */
const CJK_PUNCT = /[　-〿＀-￯]/;

function fixNode(node: MdNode): void {
	const kids = node.children;
	if (!kids) return;
	for (let i = 0; i < kids.length; i++) {
		const child = kids[i];
		fixNode(child);
		if (child.type !== "link" || typeof child.url !== "string") continue;

		const hit = CJK_PUNCT.exec(child.url);
		if (!hit || hit.index === 0) continue;

		const only =
			child.children && child.children.length === 1 ? child.children[0] : null;
		if (!only || only.type !== "text" || typeof only.value !== "string") continue;

		// 自动链接的特征：URL 以显示文本结尾。remark-gfm 会给 www. 开头的补上
		// "http://"，所以是后缀关系而不是全等。
		const prefixLen = child.url.length - only.value.length;
		if (prefixLen < 0 || child.url.slice(prefixLen) !== only.value) continue;

		const cut = hit.index - prefixLen;
		if (cut <= 0) continue;

		const tail = only.value.slice(cut);
		only.value = only.value.slice(0, cut);
		child.url = child.url.slice(0, hit.index);
		kids.splice(i + 1, 0, { type: "text", value: tail });
		i++; // 跳过刚插进去的那个文本节点
	}
}

/** remark 插件。放在 remark-gfm 之后用。 */
export function remarkCjkAutolink() {
	return (tree: unknown): void => {
		fixNode(tree as MdNode);
	};
}
