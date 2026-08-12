/**
 * Rule table for tracking-parameter removal.
 *
 * The system is DENYLIST-ONLY: a query parameter is removed only if it is explicitly
 * listed here. Anything unknown is kept untouched. This is what guarantees that
 * meaningful parameters survive - a YouTube link shared at a timestamp keeps its `t`
 * because nothing ever asks to remove it, not because of a special case.
 *
 * Rules are keyed by host because the same name means different things on different
 * platforms: on x.com `t` is a share token, on youtube.com/reddit.com/twitch.tv it is
 * load-bearing. A single global list could not express that.
 *
 * To support a new platform, add one entry to HOST_RULES. Nothing else changes.
 */

/** A set of query-parameter matchers. */
export interface ParamMatchers {
	/** Exact parameter names, compared lowercased after percent-decoding. */
	params?: string[];
	/** Name prefixes, for open-ended families like `utm_` or Facebook's `__cft__[0]`. */
	prefixes?: string[];
}

export interface HostRule extends ParamMatchers {
	/**
	 * Host suffixes. A URL matches when `hostname === host` or
	 * `hostname.endsWith('.' + host)`, so `youtube.com` covers www./m./music.youtube.com
	 * but never notyoutube.com.
	 */
	hosts: string[];
	/**
	 * Documentation only. Parameters on these hosts that are meaningful and must never
	 * be stripped. Denylist-only means they survive regardless; listing them here shows
	 * the landmines to whoever edits `params` next.
	 */
	keep?: string[];
	/** Optional narrowing. Rules whose predicate returns false are skipped entirely. */
	appliesTo?: (url: URL) => boolean;
}

/**
 * Host-independent trackers. Only names that mean the same thing everywhere belong
 * here. Deliberately NOT global: `si`, `t`, `s`, `ref`, `source`, `src`, `id`, `e` -
 * each is meaningful somewhere, so they are host-scoped instead.
 */
export const GLOBAL_RULE: ParamMatchers = {
	prefixes: [
		'utm_', // Google Analytics campaign family
		'mtm_', // Matomo (current naming)
		'pk_', // Matomo/Piwik (legacy naming)
		'hsa_' // HubSpot Ads
	],
	params: [
		// Ad-click identifiers
		'gclid',
		'gclsrc',
		'gbraid',
		'wbraid',
		'dclid',
		'fbclid',
		'msclkid',
		'yclid',
		'twclid',
		'ttclid',
		'li_fat_id',
		'rdt_cid',
		'epik',
		'sccid',
		'irclickid',
		'igshid',
		'igsh',
		// Email / marketing automation
		'mc_cid',
		'mc_eid',
		'mkt_tok',
		'_hsenc',
		'_hsmi',
		'hsctatracking',
		'vero_id',
		'vero_conv',
		'oly_anon_id',
		'oly_enc_id',
		'ck_subscriber_id',
		'_openstat',
		// Analytics linkers and misc
		'_ga',
		'_gl',
		's_kwcid',
		'ef_id',
		'piwik_campaign',
		'piwik_kwd',
		'wickedid',
		'soc_src',
		'soc_trk',
		'guce_referrer',
		'guce_referrer_sig'
	]
};

export const HOST_RULES: HostRule[] = [
	{
		hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
		params: [
			'si', // share-sheet attribution token - the headline case
			'feature',
			'kw',
			'source_ve_path',
			'embeds_referring_euri',
			'embeds_referring_origin',
			'embeds_widget_referrer',
			'pbjreload'
		],
		// t/start/end are timestamps, list+index are playlist position, ab_channel changes
		// the displayed channel. None of these may ever move into `params`.
		keep: ['v', 't', 'start', 'end', 'list', 'index', 'loop', 'playlist', 'ab_channel', 'app', 'hl']
	},
	{
		// `pp` is the opaque player-params blob the share sheet attaches, but on /embed/ it
		// can carry real player config (captions, loop), so this rule skips embeds.
		hosts: ['youtube.com', 'youtu.be'],
		params: ['pp'],
		appliesTo: (url) => !url.pathname.startsWith('/embed/')
	},
	{
		hosts: ['tiktok.com'], // covers www./vm./vt.
		params: [
			'is_from_webapp',
			'sender_device',
			'sender_web_id',
			'web_id',
			'_r',
			'_t',
			'_d',
			'u_code',
			'preview_pb',
			'share_app_id',
			'share_item_id',
			'share_link_id',
			'share_author_id',
			'tt_from',
			'source',
			'timestamp',
			'user_id',
			'refer',
			'referer_url',
			'enter_from',
			'social_share_type'
		],
		keep: ['lang', 'q']
	},
	{
		hosts: ['instagram.com', 'instagr.am'],
		params: ['ig_rid', 'ig_mid'],
		// img_index selects the carousel slide. e/oh/oe/_nc_* sign CDN URLs - stripping
		// any of them returns a 403.
		keep: ['img_index', 'hl', 'e', 'oh', 'oe', '_nc_sid', '_nc_ht']
	},
	{
		hosts: ['spotify.com', 'spoti.fi', 'tospotify.com'],
		params: ['si', 'nd', 'nd_lfid', '_branch_match_id', '_branch_referrer', 'trackid'],
		// `t` is the podcast-episode timestamp, `context` is the playback context URI and
		// decides what plays next.
		keep: ['t', 'context', 'go', 'play']
	},
	{
		hosts: [
			'amazon.com',
			'amazon.co.uk',
			'amazon.de',
			'amazon.fr',
			'amazon.it',
			'amazon.es',
			'amazon.nl',
			'amazon.pl',
			'amazon.se',
			'amazon.com.tr',
			'amazon.ae',
			'amazon.sa',
			'amazon.ca',
			'amazon.com.mx',
			'amazon.com.br',
			'amazon.co.jp',
			'amazon.sg',
			'amazon.in',
			'amazon.com.au',
			'amazon.eg',
			'amzn.to',
			'amzn.eu',
			'a.co'
		],
		prefixes: ['pd_rd_', 'pf_rd_'],
		params: [
			'ref',
			'ref_',
			'tag',
			'ascsubtag',
			'asc_campaign',
			'asc_refurl',
			'asc_source',
			'linkcode',
			'linkid',
			'creative',
			'creativeasin',
			'qid',
			'sr',
			'sprefix',
			'crid',
			'dib',
			'dib_tag',
			'content-id',
			'psd',
			'spia',
			'spla',
			'spc'
		],
		// th/psc pin a product variation, smid/m pin the seller - all change what you see.
		keep: ['th', 'psc', 'smid', 'm', 'k', 'keywords', 'node', 'i', 'rh', 'language', 'currency']
	},
	{
		hosts: ['x.com', 'twitter.com', 't.co'],
		// This is the case that proves per-host rules are needed: `t` here is a share
		// token, `s=20` the share-source code.
		params: ['t', 's', 'src', 'ref_src', 'ref_url', 'refsrc', 'cxt', 'twgr', 'mx', 'cn'],
		keep: ['q', 'lang', 'f', 'k']
	},
	{
		hosts: ['facebook.com', 'fb.com', 'fb.watch', 'fb.me', 'messenger.com'],
		prefixes: ['__cft__', '__xts__', '__tn__'], // arrive as __cft__[0] / __cft__%5B0%5D
		params: [
			'mibextid',
			'extid',
			'refsrc',
			'rdid',
			'share_url',
			'pnref',
			'dti',
			'notif_id',
			'notif_t',
			'ref',
			'hc_ref',
			'source',
			'__so__'
		],
		keep: ['fbid', 'set', 'story_fbid', 'id', 'v', 'e', 'oh', 'oe', '_nc_sid']
	},
	{
		hosts: ['reddit.com', 'redd.it', 'reddituploads.com'],
		params: [
			'share_id',
			'correlation_id',
			'ref',
			'ref_source',
			'ref_campaign',
			'rdt',
			'post_fullname',
			'chainedposts',
			'$deep_link',
			'$original_url',
			'_branch_match_id',
			'_branch_referrer'
		],
		// `t=week` is the top-of-timeframe filter, `context=3` controls comment ancestry.
		keep: [
			't',
			'context',
			'sort',
			'depth',
			'comment',
			'after',
			'before',
			'count',
			'limit',
			'q',
			'restrict_sr',
			'type'
		]
	},
	{
		hosts: ['twitch.tv'],
		params: ['tt_content', 'tt_medium', 'tt_email_id', 'referrer', 'tracking_id', 'sr'],
		// `t=01h02m03s` is the VOD timestamp.
		keep: ['t', 'collection', 'clip', 'video', 'filter', 'range', 'sort']
	},
	{
		hosts: ['ebay.com', 'ebay.de', 'ebay.co.uk', 'ebay.fr', 'ebay.it', 'ebay.es', 'ebay.ca'],
		params: ['mkevt', 'mkcid', 'mkrid', 'campid', 'toolid', '_trkparms', '_trksid', '_from']
	},
	{
		hosts: ['linkedin.com', 'lnkd.in'],
		params: ['trk', 'trackingid', 'refid', 'lipi', 'licu', 'originalsubdomain']
	},
	{
		hosts: ['soundcloud.com'],
		params: ['si', 'ref', 'utm_id'],
		keep: ['t', 'in']
	},
	{
		hosts: ['music.apple.com', 'itunes.apple.com', 'apple.co'],
		params: ['uo', 'at', 'ct', 'itscg', 'itsct', 'app'],
		// `i` selects the track within an album.
		keep: ['i', 'l']
	},
	{
		hosts: ['pinterest.com', 'pin.it'],
		params: ['senderid', 'invite_code', 'sender']
	}
];
