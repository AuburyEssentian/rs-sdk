import { db } from '#/db/query.js';
import { tryParseInt } from '#/util/TryParse.js';
import { escapeHtml, SKILL_NAMES, ENABLED_SKILLS } from '../utils.js';

export async function handleHiscoresPage(url: URL): Promise<Response | null> {
    if (url.pathname !== '/hiscores' && url.pathname !== '/hiscores/') {
        return null;
    }

    const category = tryParseInt(url.searchParams.get('category'), -1);
    const profile = url.searchParams.get('profile') || 'main';
    const playerSearch = url.searchParams.get('player')?.toLowerCase().trim() || '';

    let rows: { rank: number; username: string; level: number; xp: number }[] = [];
    let selectedSkill = 'Overall';
    let searchedPlayer: { rank: number; username: string; level: number; xp: number } | null = null;

    if (category === -1 || category === 0) {
        // Overall - query hiscore_large
        let query = db
            .selectFrom('hiscore_large')
            .innerJoin('account', 'account.id', 'hiscore_large.account_id')
            .select(['account.username', 'hiscore_large.level', 'hiscore_large.value'])
            .where('hiscore_large.type', '=', 0)
            .where('hiscore_large.profile', '=', profile)
            .where('account.staffmodlevel', '<=', 1)
            .orderBy('hiscore_large.value', 'desc');

        const allResults = await query.execute();
        rows = allResults.slice(0, 100).map((r, i) => ({ rank: i + 1, username: r.username, level: r.level, xp: Number(r.value) }));

        if (playerSearch) {
            const idx = allResults.findIndex(r => r.username.toLowerCase() === playerSearch);
            if (idx !== -1) {
                const r = allResults[idx];
                searchedPlayer = { rank: idx + 1, username: r.username, level: r.level, xp: Number(r.value) };
            }
        }
        selectedSkill = 'Overall';
    } else {
        // Individual skill - query hiscore
        const skillIndex = category - 1;
        const skillName = SKILL_NAMES[skillIndex];
        if (skillName) {
            let query = db
                .selectFrom('hiscore')
                .innerJoin('account', 'account.id', 'hiscore.account_id')
                .select(['account.username', 'hiscore.level', 'hiscore.value'])
                .where('hiscore.type', '=', category)
                .where('hiscore.profile', '=', profile)
                .where('account.staffmodlevel', '<=', 1)
                .orderBy('hiscore.value', 'desc');

            const allResults = await query.execute();
            rows = allResults.slice(0, 100).map((r, i) => ({ rank: i + 1, username: r.username, level: r.level, xp: r.value }));

            if (playerSearch) {
                const idx = allResults.findIndex(r => r.username.toLowerCase() === playerSearch);
                if (idx !== -1) {
                    const r = allResults[idx];
                    searchedPlayer = { rank: idx + 1, username: r.username, level: r.level, xp: r.value };
                }
            }
            selectedSkill = skillName;
        }
    }

    const formatXp = (xp: number) => xp.toLocaleString();

    const skillOptions = [
        { id: 0, name: 'Overall' },
        ...ENABLED_SKILLS.map(s => ({ id: s.id + 1, name: s.name }))
    ];

    const currentCategory = category === -1 ? 0 : category;

    const html = `<!DOCTYPE html>
<html>
<head>
    <title>${selectedSkill} Hiscores</title>
    <style>
        body, p, td { font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
        body { background: #382418; color: #fff; margin: 0; padding: 0; }
        a { text-decoration: none; }
        a:hover { text-decoration: underline; }
        .yellow { color: #FFE139; }
        .green { color: #04A800; }
        .lblue { color: #9DB8C3; }
        .white { color: #fff; }
        .orange { color: #ffbb22; }
        .b { border: 3pt outset #373737; }
        .main { width: 800px; margin: 20px auto; }
        .header { background: #2b1a0f; padding: 10px 15px; border-bottom: 2px solid #1a0f05; }
        .header a { color: #FFE139; font-weight: bold; }
        .content { background: #1a0f05; padding: 15px; }
        .title { font-size: 16px; font-weight: bold; margin-bottom: 15px; }
        .skills { margin-bottom: 15px; line-height: 1.8; }
        .skills a { color: #ffbb22; margin-right: 8px; }
        .skills a:hover { color: #FFE139; }
        .skills a.active { color: #FFE139; font-weight: bold; }
        .controls { margin-bottom: 15px; }
        .controls select { font-size: 13px; padding: 2px 5px; }
        table { width: 100%; border-collapse: collapse; background: #0f0802; }
        table.b { border: 3pt outset #373737; }
        th { background: #2b1a0f; color: #FFE139; text-align: left; padding: 6px 10px; font-weight: bold; }
        td { padding: 4px 10px; border-bottom: 1px solid #2b1a0f; }
        tr:hover td { background: #1a0f05; }
        .rank { width: 60px; }
        .level { width: 70px; text-align: right; }
        .xp { width: 110px; text-align: right; }
        .empty { padding: 30px; text-align: center; color: #666; }
        .search-result { margin-top: 15px; padding-top: 15px; border-top: 1px solid #2b1a0f; }
        .search-result table { margin-bottom: 0; }
        .search { margin-top: 15px; padding-top: 15px; border-top: 1px solid #2b1a0f; }
        .search-result + .search { border-top: none; padding-top: 10px; }
        .search input { font-size: 13px; padding: 3px 6px; width: 150px; }
        .search input[type="submit"] { width: auto; cursor: pointer; }
    </style>
</head>
<body>
    <div class="main">
        <div class="b">
            <div class="header">
                <a href="/">Main Menu</a>
            </div>
            <div class="content">
                <div class="title yellow">${selectedSkill} Hiscores</div>

                <div class="skills">
                    ${skillOptions.map(s =>
                        `<a href="/hiscores?category=${s.id}&profile=${profile}" class="${currentCategory === s.id ? 'active' : ''}">${s.name}</a>`
                    ).join(' ')}
                </div>

                <table class="b">
                    <tr>
                        <th class="rank">Rank</th>
                        <th>Name</th>
                        <th class="level">Level</th>
                        <th class="xp">XP</th>
                    </tr>
                    ${rows.length > 0 ? rows.map(r => `<tr>
                        <td class="rank lblue">${r.rank}</td>
                        <td class="green">${escapeHtml(r.username)}</td>
                        <td class="level white">${r.level}</td>
                        <td class="xp lblue">${formatXp(r.xp)}</td>
                    </tr>`).join('') : '<tr><td colspan="4" class="empty">No players found</td></tr>'}
                </table>

                ${searchedPlayer ? `<div class="search-result">
                    <table class="b">
                        <tr>
                            <th class="rank">Rank</th>
                            <th>Name</th>
                            <th class="level">Level</th>
                            <th class="xp">XP</th>
                        </tr>
                        <tr>
                            <td class="rank lblue">${searchedPlayer.rank}</td>
                            <td class="green">${escapeHtml(searchedPlayer.username)}</td>
                            <td class="level white">${searchedPlayer.level}</td>
                            <td class="xp lblue">${formatXp(searchedPlayer.xp)}</td>
                        </tr>
                    </table>
                </div>` : playerSearch ? `<div class="search-result"><span class="lblue">Player "${escapeHtml(playerSearch)}" not found.</span></div>` : ''}

                <div class="search">
                    <form method="get" action="/hiscores" style="display:inline">
                        <input type="hidden" name="category" value="${currentCategory}">
                        <input type="hidden" name="profile" value="${profile}">
                        <span class="lblue">Search by name:</span>
                        <input type="text" name="player" placeholder="Username" value="${escapeHtml(playerSearch)}">
                        <input type="submit" value="Search">
                    </form>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
