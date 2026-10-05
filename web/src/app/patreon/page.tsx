import React from "react";
import Image from "next/image";
import ExternalLink from "@/components/ExternalLink";
import MainLayout from "@/components/MainLayout";
import { Button, PageContainer, PageHeader, Surface } from "@/components/md3";
import { mdArrowBack } from "@/components/md3/icons";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("patreon");

export default function PatreonPage() {
    return (
        <MainLayout showLoader={true}>
            <PageContainer className="z-10 max-w-3xl flex-grow">
                <PageHeader title="支持 moesekai!" />

                <Surface tone="low" className="space-y-8 p-6 type-body-l text-on-surface sm:p-8">
                    <section className="space-y-4">
                        <p className="type-title-m">
                            Welcome to the official support page of moesekai!
                            <br />
                            <span className="type-body-l text-on-surface-variant">欢迎来到 moesekai 的官方赞助页面！</span>
                        </p>

                        <p>
                            <ExternalLink href="https://pjsk.moe/" className="rounded-md3-xs font-medium text-primary underline decoration-dotted focus-ring hover:opacity-80">
                                https://pjsk.moe/
                            </ExternalLink>
                        </p>
                    </section>

                    <section className="space-y-4 pt-4 border-t border-outline-variant">
                        <p>
                            I&apos;m Exmeaning, the lead developer of <ExternalLink href="https://star.moe" className="rounded-md3-xs font-medium underline focus-ring hover:text-primary">StarMoe</ExternalLink>. I hope moesekai will be your fastest, most beautiful, and ultimate hub for everything Project SEKAI!
                            <br />
                            <span className="text-on-surface-variant">我是 東雪 (Exmeaning)，<ExternalLink href="https://star.moe" className="rounded-md3-xs font-medium underline focus-ring hover:text-primary">StarMoe</ExternalLink> 的主要开发者。我希望 moesekai 能够成为你探索《世界计划 (PJSK)》最快、最美、也是最棒的数字枢纽！</span>
                        </p>
                    </section>

                    <section className="space-y-4 pt-4 border-t border-outline-variant">
                        <h2 className="type-headline-s text-on-surface">About moesekai! 关于 moesekai!</h2>

                        <p>
                            moesekai (formerly Snowy SekaiViewer) started as a personal project born out of love for PJSK and a desire for a modern, blazing-fast, and aesthetically pleasing data viewer.
                            <br />
                            <span className="text-on-surface-variant">moesekai（原 Snowy SekaiViewer）最初只是一个出于对 PJSK 的热爱而诞生的个人项目，我致力于打造一个现代化、极速且高颜值的查分与数据浏览平台。</span>
                        </p>

                        <p>
                            Soon, our request volume exploded, reaching millions of requests in less than a week. As more users joined us, I realized players needed a unified, high-performance site rather than scattered, slow-loading spreadsheets or outdated web pages.
                            <br />
                            <span className="text-on-surface-variant">很快，我们的访问请求量迎来了爆炸式增长，不到一周就达成了数百万次请求的成就。随着越来越多用户的加入，我意识到玩家们需要的是一个统一、高性能的聚合站点，而不是散落各处、加载缓慢的表格或过时的网页。</span>
                        </p>

                        <p>
                            Thus, moesekai is constantly evolving—with a advanced architecture and a carefully crafted custom UI (you can even choose your favorite unit&apos;s theme color!), bringing the ultimate experience directly to you.
                            <br />
                            <span className="text-on-surface-variant">因此，moesekai 在不断进化——凭借先进的架构和精心定制的 UI（你甚至可以在设置里切换推色的主题！），将最极致的体验直接带给你。</span>
                        </p>
                    </section>

                    <section className="space-y-4 pt-4 border-t border-outline-variant">
                        <h2 className="type-headline-s text-on-surface">Why Become a Patron? 为什么要成为赞助人？</h2>

                        <p>
                            Becoming a patron is the most direct way to support moesekai!
                            <br />
                            <span className="text-on-surface-variant">成为赞助者是最直接支持 moesekai 的方式！</span>
                        </p>

                        <p>
                            I am currently just a college student. Seeing the site grow so rapidly is a dream come true, but the reality of operational costs is becoming too heavy to bear alone. I&apos;ve set up this page due to popular demand from our amazing community who wants to help keep the server running smoothly.
                            <br />
                            <span className="text-on-surface-variant">我目前只是一名普通的在校大学生。看着网站如此迅速地成长，感觉就像梦想成真一样，但随之而来的日常运营开销我已经越来越难以独自承担。应我们超棒的社区群友们的要求，我创建了这个页面，让大家可以一起帮忙维持网站的丝滑运转。</span>
                        </p>

                        <div className="mt-4">
                            <h3 className="mb-2 mt-4 type-title-l text-on-surface">Rewards for patrons: 支持者的奖励：</h3>
                            <ul className="list-inside list-disc space-y-2">
                                <li>
                                    Monthly shoutout on moesekai&apos;s homepage / sponsor list
                                    <br />
                                    <span className="ml-5 block text-on-surface-variant">在 moesekai 官网主页/赞助者列表的专属致谢</span>
                                </li>
                                <li>
                                    Special role in our community group
                                    <br />
                                    <span className="ml-5 block text-on-surface-variant">在开发者/交流群内的专属身份标识</span>
                                </li>
                                <li>
                                    And more to come! (As we grow, I&apos;ll think of more fun ways to thank you!)
                                    <br />
                                    <span className="ml-5 block text-on-surface-variant">未来还有更多！（随着我们的成长，我会想出更多有趣的方式来感谢大家！）</span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    <section className="space-y-4 pt-4 border-t border-outline-variant">
                        <h2 className="type-headline-s text-on-surface">Where will the Money Go? 钱将去哪里？</h2>

                        <p>
                            Currently, the premium domain (pjsk.moe), the lightweight server (yes, it survived on 2G memory for a while!) are all paid out of my own pocket. Your pledge will go directly to these critical infrastructures.
                            <br />
                            <span className="text-on-surface-variant">目前，pjsk.moe 的高级域名、服务器（是的，它曾经靠 2G 内存硬抗了巨大的流量！），全都是我自掏腰包支付的。你的赞助将直接用于维持这些核心基础设施。</span>
                        </p>

                        <p>
                            As our traffic grows towards the goal of 100M+ requests, the expenses will multiply. Your support relieves this financial pressure immensely, allowing me to focus on adding crazy new features instead of worrying about server bills!
                            <br />
                            <span className="text-on-surface-variant">随着网站流量向着“破亿请求量”的目标迈进，开销也会成倍增加。你的支持能极大地缓解我的经济压力，让我能把精力专注于开发超酷的新功能，而不是天天盯着服务器账单发愁！</span>
                        </p>

                        <p>
                            And lastly, if there are any leftovers, I&apos;ll treat myself to a nice meal (or maybe a new Raspberry Pi to play with!) :D
                            <br />
                            <span className="text-on-surface-variant">最后，如果还有剩余的资金，我会用它们去吃一顿好吃的大餐（或者买个新的树莓派当玩具！）:D</span>
                        </p>
                    </section>

                    <section className="space-y-4 pt-4 border-t border-outline-variant">
                        <h2 className="type-headline-s text-on-surface">Some Random Facts about Me 关于我的一些碎碎念</h2>

                        <ul className="list-inside list-disc space-y-2">
                            <li>Yes, I&apos;m just a college student coding in my dorm. <span className="text-on-surface-variant">(偶尔还要和打呼噜的室友斗智斗勇！)</span></li>
                            <li>My favorite character are kohane and minori <span className="text-on-surface-variant">（我最推的角色是豆花）</span></li>
                            <li>My favorite unit is 25n <span className="text-on-surface-variant">（我最喜欢的团体是25h）</span></li>
                            <li>I&apos;m completely addicted to building fast microservices. <span className="text-on-surface-variant">(重度高性能微服务与架构开发上瘾患者)</span></li>
                        </ul>
                    </section>

                    <section className="space-y-4 pt-4 border-t border-outline-variant">
                        <h2 className="type-headline-s text-on-surface">Lastly... 最后...</h2>

                        <p>
                            Thank you so much for reading all the way, and for your continuous support!
                            <br />
                            <span className="text-on-surface-variant">非常感谢你一直读到结尾，以及对 moesekai 的持续支持！</span>
                        </p>

                        <p>
                            moesekai would not be the amazing platform it is today without every single one of you!
                            <br />
                            <span className="text-on-surface-variant">没有你们每一个人，moesekai 绝不可能成为今天这样一个超凡的平台！</span>
                        </p>

                        <p className="mt-4 rounded-md3-md bg-surface-container-high p-4">
                            你可以 <span className="font-medium text-primary">加入我们的官方用户群 1075068454</span> 进行网站反馈，与开发者交流，获取 moesekai 的最新动态！
                        </p>
                    </section>

                    <section className="space-y-4 pt-8 border-t border-outline-variant mb-8">
                        <h2 className="mb-2 type-headline-s text-on-surface">赞助</h2>

                        <p className="mb-6 rounded-md3-md bg-primary-container p-4 text-on-primary-container">
                            <strong className="font-medium">附言：</strong>赞助时请附言你的<strong>个人ID</strong>，以便于 moesekai 将你加入我们的感谢名单中！
                        </p>

                        <p className="mb-6 text-center type-body-m text-on-surface-variant">
                            目前 moesekai 的服务器已进行过增加/升级，哪怕你不进行赞助，只要你一直支持我们，我们都会持续进行运营的！
                        </p>

                        <div className="flex flex-col sm:flex-row gap-12 justify-center items-center">
                            {/* Alipay */}
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative h-56 w-56 overflow-hidden rounded-md3-lg border border-outline-variant shadow-elev-1">
                                    <Image
                                        src="/patreon/alipay.png"
                                        alt="支付宝收款码"
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                                <div className="text-center">
                                    <p className="type-title-m text-on-surface">支付宝 / Alipay</p>
                                </div>
                            </div>

                            {/* WeChat */}
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative h-56 w-56 overflow-hidden rounded-md3-lg border border-outline-variant shadow-elev-1">
                                    <Image
                                        src="/patreon/wechat.png"
                                        alt="微信收款码"
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                                <div className="text-center">
                                    <p className="type-title-m text-on-surface">微信 / WeChat Pay</p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 pt-8 border-t border-outline-variant">
                            <h3 className="mb-4 type-title-l text-on-surface">海外赞助 / International Support</h3>
                            <p className="mb-4 text-on-surface-variant">
                                如果你希望使用国际支付方式赞助我们，可以通过 Ko-fi 进行支持！
                                <br />
                                <span className="text-on-surface-variant">If you&apos;d like to support us with an international payment method, you can sponsor us via Ko-fi!</span>
                            </p>
                            <div className="flex justify-center">
                                <ExternalLink
                                    href="https://ko-fi.com/moesekai"
                                    className="rounded-md3-sm focus-ring"
                                >
                                    <img
                                        src="https://storage.ko-fi.com/cdn/brandasset/v2/support_me_on_kofi_dark.png"
                                        alt="Support me on Ko-fi"
                                        className="h-12 hover:opacity-80 transition-opacity"
                                    />
                                </ExternalLink>
                            </div>
                        </div>

                        <div className="mt-12 pt-8 border-t border-outline-variant">
                            <h3 className="mb-4 type-title-l text-on-surface">你也可以以其它形式支持我们</h3>
                            <p className="rounded-md3-md bg-primary-container p-4 text-on-primary-container">
                                <strong className="font-medium">服务器赞助：</strong>如果你有服务器愿意低于市场价租赁/免费赞助我们 也可以联系我们！
                                <br />
                                <span className="mt-1 block type-body-m">moesekai目前的需求：存储≈带宽＞内存/核心</span>
                            </p>
                        </div>
                    </section>
                </Surface>

                <div className="mt-8 flex justify-center">
                    <Button href="/" variant="text" icon={mdArrowBack}>
                        返回首页
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}
