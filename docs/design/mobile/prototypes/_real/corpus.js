/* #28 真实字幕语料 —— 两批，都是生产服务器上的真句子，不是造出来的。

   第一批 five：截图里那条 CNBC《How Micron's Building Biggest U.S. Chip Fab》中可见的 5 句，
   中英对照齐全（视频 id 63288cd3-2789-47d7-ba66-a83c982f33a9，C1，17:43）。
   长度 32 / 131 / 179 / 131 / 82 字符。

   第二批 sampled：从生产库的公开字幕搜索端点采样去重得到的 131 句（仅英文，该端点不返回中文）。
   长度 25–216，中位 88。采样查询词见 run.js 顶部注释。

   ★ 为什么需要它：原型自带的演示语料（_demo.js 那 10 句）是本地库的 CI 种子视频，
     长度 33–70（中位 54）。生产字幕的**中位数已经超过它最长的那句** —— 用它做版式决策会低估一倍。
*/
window.REAL = {
  five: [
  {
    "t": "09:01",
    "en": "And this is the first major one.",
    "zh": "而这是第一个重大事件。"
  },
  {
    "t": "09:03",
    "en": "For now, Micron is still in China, but China is turning to memory from Samsung, SK Hynix and smaller Chinese memory makers instead.",
    "zh": "目前，美光仍在中国，但中国转而采用三星、SK海力士和较小的中国内存制造商的存储产品。"
  },
  {
    "t": "09:05",
    "en": "That's possible because memory is considered a commodity, meaning it's relatively easy to switch between products from different companies, although that's not guaranteed to last.",
    "zh": "这之所以可能，是因为内存被视为一种商品，意味着在不同公司的产品之间切换相对容易，尽管这种局面未必能长久维持。"
  },
  {
    "t": "09:09",
    "en": "What I'm going to find really interesting is when we get back to the boom days and Hynix and Samsung can't fulfill all the volumes.",
    "zh": "我觉得真正有趣的是，当我们回到繁荣期，而海力士和三星无法满足所有需求量时。"
  },
  {
    "t": "09:13",
    "en": "you might see China diving back into Micron and suddenly lifting any restrictions.",
    "zh": "你可能会看到中国重新大量采购美光的产品，并突然解除任何限制。"
  }
],
  sampled: [
  {
    "en": "Jey, I understand - Her ribs were busted by the",
    "level": "B2"
  },
  {
    "en": "I understand the result, Chelsea was there for her.",
    "level": "B2"
  },
  {
    "en": "And now Lash Legend getting up on the apron.",
    "level": "B2"
  },
  {
    "en": "All right, so I did get the note yesterday.",
    "level": "B2"
  },
  {
    "en": "A couple of things. First of all, your Honor acknowledges that I have an objection, which I appreciate, and I do have an objection, and I am again citing Article 12, Sixth Amendment of the United States Constitution.",
    "level": "B2"
  },
  {
    "en": "The Commonwealth is represented by Assistant District Attorney Jennifer Sprague and Assistant District Attorney Shannon Buckingham.",
    "level": "B2"
  },
  {
    "en": "on things that it has stored in its long -term memory.",
    "level": "B2"
  },
  {
    "en": "That's how things are then anchored in our long -term memory.",
    "level": "B2"
  },
  {
    "en": "It's about the things you've done together in the memories you've made",
    "level": "B1"
  },
  {
    "en": "Here's to 10 years, but 10 million memories.",
    "level": "B1"
  },
  {
    "en": "and five million memories.",
    "level": "B1"
  },
  {
    "en": "He has no memory of the past,",
    "level": "B2"
  },
  {
    "en": "However, thanks for bringing up great memories.",
    "level": "B2"
  },
  {
    "en": "The mix of smartphones is going more and more toward higher end smartphones, toward the flagship smartphones, which require more memory as well.",
    "level": "C1"
  },
  {
    "en": "When it comes to the biggest type of memory, DRAM, South Korean giant Samsung is by far the leader in revenue, followed by SK Hynix, also out of Korea, and then Micron in the U.S.",
    "level": "C1"
  },
  {
    "en": "Micron supplies memory in phones from Apple, Motorola, Asus and more.",
    "level": "C1"
  },
  {
    "en": "Elon Musk's company is exploring several sites in Texas for the home of its next big data center",
    "level": "B2"
  },
  {
    "en": "if you're writing and particularly if you're working for a company or you're",
    "level": "B2"
  },
  {
    "en": "It reflects badly on you and on the company you're working for.",
    "level": "B2"
  },
  {
    "en": "Say you're working for a company in English or German or Japanese, and",
    "level": "B2"
  },
  {
    "en": "You would not say, I work in, and then a company name.",
    "level": "B2"
  },
  {
    "en": "at whichever company you don't necessarily have to say field you can say I have ten years of",
    "level": "B2"
  },
  {
    "en": "is your position and your company for example i work at google in the marketing department",
    "level": "B2"
  },
  {
    "en": "he said, it will not be easy to convince my company",
    "level": "B2"
  },
  {
    "en": "company make three different shades of blue but the dyes were so unstable they",
    "level": "B2"
  },
  {
    "en": "So they were confused when they got a call from one of their customers a beverage company in LA",
    "level": "B2"
  },
  {
    "en": "After driving the largest vehicle I've ever attempted across LA, I hired a moving company.",
    "level": "B2"
  },
  {
    "en": "Still in Arizona, the world's advanced ship leader, Taiwan Semiconductor Manufacturing Company, recently blamed a shortage of skilled labor for delays to its massive $40 billion fab under construction there.",
    "level": "C1"
  },
  {
    "en": "That's possible because memory is considered a commodity, meaning it's relatively easy to switch between products from different companies, although that's not guaranteed to last.",
    "level": "C1"
  },
  {
    "en": "And it's no surprise that Micron, and more than 460 other companies, have applied for those funds.",
    "level": "C1"
  },
  {
    "en": "And so the more the hours tick on here, you have people who are going to have more disdain and aggravation.",
    "level": "B2"
  },
  {
    "en": "They don't want to, you know, take away people's First Amendment protections.",
    "level": "B2"
  },
  {
    "en": "I'm sure you have people that want to bang their heads against the wall.",
    "level": "B2"
  },
  {
    "en": "Not many people show up to the shelter looking for the shut down pit bull.",
    "level": "B1"
  },
  {
    "en": "from people in the community needing help.",
    "level": "B1"
  },
  {
    "en": "I'm frustrated because people don't stay and neuter.",
    "level": "B1"
  },
  {
    "en": "day, I mean, people can't afford to live. And the last thing you need is the richest man in the",
    "level": "B2"
  },
  {
    "en": "frankly, by the vice president and many other people.",
    "level": "B2"
  },
  {
    "en": "And, you know, we have a guy named Ken Paxton and some people don't like the way he dresses.",
    "level": "B2"
  },
  {
    "en": "economically as soon as the people have weapons where they can give i'm not saying a fair fight",
    "level": "B2"
  },
  {
    "en": "And most of all, for the 80 million people who've basically been in a prison.",
    "level": "B2"
  },
  {
    "en": "The pressure economically on these people, they already were not getting water in Tehran.",
    "level": "B2"
  },
  {
    "en": "Trump administration blowing up boats they say have drug traffickers in them, people killed",
    "level": "C1"
  },
  {
    "en": "The Iranian Red Crescent Society says at least five wedding guests were killed, including a four -year -old boy, and at least 67 other people were wounded.",
    "level": "C1"
  },
  {
    "en": "celebration earlier this week killed several people, injured dozens of others. I know CENTCOM",
    "level": "C1"
  },
  {
    "en": "the people who are going to actually crawl over broken glass to vote are the ones who are more energized and the ones who might give up are the ones Trump most needs.",
    "level": "C1"
  },
  {
    "en": "because their gas has gone up. The inflation is choking them. And you have his people that",
    "level": "C1"
  },
  {
    "en": "I believe there will be huge turnouts. I think that the fact that Donald Trump's election strategy is to stop people from voting.",
    "level": "C1"
  },
  {
    "en": "they're talking to people at church, at work, at school, in their neighborhoods,",
    "level": "B2"
  },
  {
    "en": "People are coming up in big numbers and they're not just,",
    "level": "B2"
  },
  {
    "en": "You saw how many more people voted, voting in Democratic primaries",
    "level": "B2"
  },
  {
    "en": "Most people give up because they're frustrated because they feel they're",
    "level": "B2"
  },
  {
    "en": "the most? The area that most people seem to be concerned about when it comes to being overly",
    "level": "B2"
  },
  {
    "en": "Even though in reality, people who are more adventurous in their use of the",
    "level": "B2"
  },
  {
    "en": "is we used to shake hands with people,",
    "level": "A2"
  },
  {
    "en": "so people won't hear you.",
    "level": "A2"
  },
  {
    "en": "people's hearts? Yes, I act. I pretend to be somebody else for a living. So you can",
    "level": "B2"
  },
  {
    "en": "see why that question haunts me extra. This question as to why people love you has been",
    "level": "B2"
  },
  {
    "en": "Well, I think Tiffany Stratton was about to go for that prettiest movesault ever.",
    "level": "B2"
  },
  {
    "en": "I THINK THE JUDGE IS ABSOLUTELY RIGHT.",
    "level": "B2"
  },
  {
    "en": "opinion on this case, it's going to be a difficult lift to think it didn't affect them.",
    "level": "B2"
  },
  {
    "en": "I think we will hear something today.",
    "level": "B2"
  },
  {
    "en": "When I prioritize, I think about which dogs",
    "level": "B1"
  },
  {
    "en": "that the race in Wisconsin did, where he's out there with a cheese hat on. I think he maybe",
    "level": "B2"
  },
  {
    "en": "human obsolesion machine. I see. OK, I kind of because I think that Democrat like Gina Hinoosa",
    "level": "B2"
  },
  {
    "en": "And she could, if he takes money from Elon Musk, I think she can say he's funded by the",
    "level": "B2"
  },
  {
    "en": "I think that they should pay a price for that.",
    "level": "B2"
  },
  {
    "en": "What did y 'all think about J .D. Vance not characterizing this as a war?",
    "level": "B2"
  },
  {
    "en": "I just think the president is on path to thoroughly be vindicated.",
    "level": "B2"
  },
  {
    "en": "it would be very good news. Unfortunately, I don't think Trump actually means the war",
    "level": "C1"
  },
  {
    "en": "and unlawful. What are you watching and girding for? Well, I think the first thing is the tell",
    "level": "C1"
  },
  {
    "en": "Gotta respect the way Tiffany Stratton has gone about her business recently.",
    "level": "B2"
  },
  {
    "en": "I've been thinking about this for quite a while.",
    "level": "B2"
  },
  {
    "en": "The fact that I perhaps didn't give it my full inflection, I'm sorry about that. I'm not an actor. I've just given the instructions.",
    "level": "B2"
  },
  {
    "en": "made a mistake in talking to the jury about what type of note they should send. I'm not so sure I",
    "level": "B2"
  },
  {
    "en": "You can just see it in her like she's excited about life she's happy she likes human interaction",
    "level": "B1"
  },
  {
    "en": "I received some calls about this pregnant dog who was left behind by her previous owners.",
    "level": "B1"
  },
  {
    "en": "There's a lot that drives me crazy about him.",
    "level": "B2"
  },
  {
    "en": "I just want to play this about his relationship with Tucker Carlson, who has also said some quite anti -Semitic things.",
    "level": "B2"
  },
  {
    "en": "can latch on to. But, you know, I don't think that this race becomes about Elon Musk the way",
    "level": "B2"
  },
  {
    "en": "I think that it was a smart, strategic thing to do because, you know, everything is about the clock when it comes to funding from Congress and what they can authorize.",
    "level": "B2"
  },
  {
    "en": "I think about the men, obviously, they're important, too.",
    "level": "B2"
  },
  {
    "en": "OF INFLATION IS ABOUT 70 % A YEAR.",
    "level": "B2"
  },
  {
    "en": "no active shooting. And I don't know about you, but I would call that active shooting.",
    "level": "C1"
  },
  {
    "en": "scribe about what's happened in the conflict thus far so i'm extremely skeptical of this",
    "level": "C1"
  },
  {
    "en": "in the region. In the past six months, 18 members of the U .S. military have been killed and about",
    "level": "C1"
  },
  {
    "en": "Vance out there to act like he really knows what he's talking about.",
    "level": "C1"
  },
  {
    "en": "elections. And you know what Donald Trump is not talking about? Why voters should vote for him and",
    "level": "C1"
  },
  {
    "en": "Quote, across the nine states reportedly targeted in the surge, some said they had yet to hear from Homeland Security about any possible voter fraud investigations.",
    "level": "C1"
  },
  {
    "en": "No, because it cost her her United States Championship to J .C.",
    "level": "B2"
  },
  {
    "en": "This was interesting, what we heard this morning, because I think it gives us more insight into what was actually in that note.",
    "level": "B2"
  },
  {
    "en": "no control over because now you've had control the entire trial and now you've had to hand this case",
    "level": "B2"
  },
  {
    "en": "another read of that instruction regarding proof beyond a reasonable doubt, because Kevin Reddington",
    "level": "B2"
  },
  {
    "en": "There are countless more, all because of Audrey.",
    "level": "B1"
  },
  {
    "en": "heart because she probably didn't get that much attention at all and that's why she's learning",
    "level": "B1"
  },
  {
    "en": "because there's like a lot of throwing at the Democratic Party about that term specifically.",
    "level": "B2"
  },
  {
    "en": "to say. I think this is a guy he's trying to lift up because the polls are really tight.",
    "level": "B2"
  },
  {
    "en": "parts of the country. This could be critical, because in the past, it's been gasoline shortages",
    "level": "B2"
  },
  {
    "en": "and especially the older women because they lived they were around when they were able to do that",
    "level": "B2"
  },
  {
    "en": "have no responsibility for the actions the armed forces have been ordered to take because those",
    "level": "C1"
  },
  {
    "en": "believe morale is suffering because of these longer and harder deployments. That is very",
    "level": "C1"
  },
  {
    "en": "an end to the war, I want to push back on that just a little bit because major combat operations",
    "level": "C1"
  },
  {
    "en": "Right. They were voting last time, though I may have disagreed with him because they felt that Biden and Harris had not delivered.",
    "level": "C1"
  },
  {
    "en": "for years, I'm really saying he's not even on his game because he usually by now would have a theme",
    "level": "C1"
  },
  {
    "en": "on Fox that everybody needs to get behind Ken Paxton. Because my question for you is that for",
    "level": "B2"
  },
  {
    "en": "in large part because the administration finds itself in the middle of a war that they can't",
    "level": "B2"
  },
  {
    "en": "Because that's our story narrative earlier in the year about how much Democrats aren't raising air quotes for those who aren't watching.",
    "level": "B2"
  },
  {
    "en": "Get real comfortable because that is the future of SmackDown from here on out.",
    "level": "B2"
  },
  {
    "en": "Because you're talking like you're the victim, Gunther.",
    "level": "B2"
  },
  {
    "en": "pronunciation because it tells you exactly how to say the word.",
    "level": "B1"
  },
  {
    "en": "Again, we're seeing how this judge is really treading in some dangerous waters here.",
    "level": "B2"
  },
  {
    "en": "At first, she was really shut down. She was really nervous and she was sick.",
    "level": "B1"
  },
  {
    "en": "she likes playing with the other dogs she's like really coming out of her show now it breaks my",
    "level": "B1"
  },
  {
    "en": "any time i would get closer she would immediately disappear i started to get really worried",
    "level": "B1"
  },
  {
    "en": "away, I think that is a really good story for Democrats.",
    "level": "B2"
  },
  {
    "en": "it's not really clear that getting a boost from the richest man in the world is going to help",
    "level": "B2"
  },
  {
    "en": "but even to hold their own then we're really going to see some major change happen in iran",
    "level": "B2"
  },
  {
    "en": "really take place because we have hit them from a military perspective we're hitting them",
    "level": "B2"
  },
  {
    "en": "Really? Because the United States and Iran have been trading strikes back and forth since Sunday.",
    "level": "C1"
  },
  {
    "en": "is really ending. He just wants to say he ended the war. And to show you what I mean,",
    "level": "C1"
  },
  {
    "en": "Republicans openly saying I'm busy. I can't come. So I really think for someone who has fought him",
    "level": "C1"
  },
  {
    "en": "we get more back organized because that's what we need to do but let's be also really clear about",
    "level": "B2"
  },
  {
    "en": "the last 10 years, Republicans have supported their nominee and they really have gotten on",
    "level": "B2"
  },
  {
    "en": "on darlene graham and he isn't really hitting the campaign trail he said he didn't get that much he's",
    "level": "B2"
  },
  {
    "en": "So at a later stage in the language, when we want to really improve certain",
    "level": "B2"
  },
  {
    "en": "When you snap your fingers, it makes a really cool sound.",
    "level": "A2"
  },
  {
    "en": "And we also use our fingers to make really bad gestures,",
    "level": "A2"
  },
  {
    "en": "If you are somewhere really loud,",
    "level": "A2"
  },
  {
    "en": "The honor is really mine.",
    "level": "B2"
  },
  {
    "en": "studied really hard. I topped 10th standard. I topped 12th standard. I topped college. But then",
    "level": "B2"
  },
  {
    "en": "when I took this up seriously do we really want to be a generation that causes the death of",
    "level": "B2"
  }
]
};
