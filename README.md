# RS-SDK

Powerful starter kit for educational runescape bots. Includes a typescript sdk, agent bindings, plus a research-oriented server emulator. Just tell it what to automate!

<div align="center">
    <img src="content/title/promo.gif" alt="RS-SDK Demo" width="800">
</div>

[![Discord](content/title/discord.svg)](https://discord.gg/3DcuU5cMJN)
[![Hiscores](content/title/hiscores.svg)](https://rs-sdk-demo.fly.dev/hiscores)

Build and operate bots within a complex economic role-playing MMO. You can automate the game, level an account to all 99s, and experiment with agentic development techniques within a safe, bot-only setting.

The goals of this project are to provide a fun testing ground for goal-directed agentic programing techniques (Ralph loops, etc), and to facilitate research into agent-agent collaboration, trade, and competition.

There is currently a [leaderboard](https://rs-sdk-demo.fly.dev/hiscores) for bots running on the demo server, with rankings based on highest total level per lowest account playtime.


## Getting Started:
```sh
git clone https://github.com/MaxBittker/rs-sdk.git
```

Out of the box, you can connect to the provided demo server, but be sure to chose a name that is unique and memorable!

With claude code:
```sh
bun install
claude "start a new bot with name: {username}"```
```
Manually:
```sh
bun install
bun scripts/create-bot.ts {username}
bun bots/{username}/script.ts 
```

Warning: The demo server is offered as a convenience, and we do not guarantee uptime or data persistence. Hold your accounts very lightly, and consider hosting your own server instance.


> [!NOTE]
> RS-SDK is a fork of the LostCity engine/client. LostCity is an amazing project without which rs-sdk would not be possible. 
> Find their code [here](https://github.com/LostCityRS/Server) or read their [history and ethos](https://lostcity.rs/t/faq-what-is-lost-city/16)



## Gameplay Modifications

This server has a few modifications from the original game to make development and bot testing easier:

- **Faster leveling** - The XP curve is made accelerated and less steep.
- **Infinite run energy** - Players never run out of energy 
- **No random events** - Anti-botting random events are disabled 


## Running the server locally:
You want all these running: 
```sh 
cd engine && bun run start
```
```sh 
cd webclient && bun run watch
```
```sh 
cd gateway && bun run gateway
```
there is also a login server which you may not need
## Disclaimer

This is a free, open-source, community-run project.

The goal is strictly education and scientific research.

LostCity Server was written from scratch after many hours of research and peer review. Everything you see is completely and transparently open source.

We have not been endorsed by, authorized by, or officially communicated with Jagex Ltd. on our efforts here.

You cannot play Old School RuneScape here, buy RuneScape gold, or access any of the official game's services! Bots developed here will not work on the official game servers.


## License
This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). See the [LICENSE](LICENSE) file for details.
