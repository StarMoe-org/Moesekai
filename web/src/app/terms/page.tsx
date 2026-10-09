import React from "react";
import Link from "@/components/LocalizedLink";
import MainLayout from "@/components/MainLayout";
import ExternalLink from "@/components/ExternalLink";
import { Button, PageContainer, PageHeader, Surface } from "@/components/md3";
import { mdArrowBack } from "@/components/md3/icons";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("terms");

export default function TermsPage() {
    return (
        <MainLayout>
            <PageContainer className="z-10 max-w-4xl flex-grow">
                <PageHeader title="服务条款" description="最后更新日期：2025 年 7 月" />

                <div className="space-y-5">
                    <Section title="1. 网站性质">
                        <p>
                            Moesekai（以下简称 &quot;本站&quot;，网址 pjsk.moe）是一个非盈利的粉丝向项目，
                            旨在为 Project Sekai: Colorful Stage! 玩家提供游戏数据查看服务。
                            本站由小型志愿者团队维护，不隶属于任何商业实体。
                        </p>
                    </Section>

                    <Section title="2. 知识产权">
                        <p>
                            本站展示的所有游戏素材（包括但不限于图片、音频、文本、角色设计）的版权均归
                            <span className="font-bold"> SEGA </span>及
                            <span className="font-bold"> Colorful Palette </span>所有。
                        </p>
                        <p className="mt-2">
                            本站仅将这些素材用于非商业的展示和研究目的。这是一个粉丝向的网站，一个仅用于研究目的的同人数据库。
                        </p>
                    </Section>

                    <Section title="3. 用户行为">
                        <p>在使用本站时，您同意不会：</p>
                        <ul className="mt-2 list-inside list-disc space-y-1">
                            <li>对本站进行任何形式的恶意攻击或干扰</li>
                            <li>使用自动化工具大量抓取本站数据</li>
                            <li>将本站内容用于任何违法或侵权用途</li>
                            <li>冒充本站或本站团队成员</li>
                        </ul>
                    </Section>

                    <Section title="4. 免责声明">
                        <p>
                            本站提供的所有游戏数据和信息均按 &quot;原样&quot; 提供，不作任何明示或暗示的保证。
                        </p>
                        <ul className="mt-2 list-inside list-disc space-y-1">
                            <li>我们不保证数据的完全准确性、完整性或时效性</li>
                            <li>游戏数据可能因版本更新而发生变化，本站可能无法实时同步</li>
                            <li>对于因使用本站信息而造成的任何损失，我们不承担责任</li>
                            <li>本站可能因维护或不可抗力因素暂时无法访问</li>
                        </ul>
                    </Section>

                    <Section title="5. 广告">
                        <p>
                            本站通过 Google AdSense 展示广告以维持运营成本。广告内容由 Google 根据其广告政策自动投放，
                            本站不对广告内容负责。有关广告数据收集的详细信息，请参阅我们的{" "}
                            <Link href="/privacy" className="rounded-md3-xs font-medium text-primary hover:underline focus-ring">
                                隐私政策
                            </Link>
                            。
                        </p>
                    </Section>

                    <Section title="6. 开源协议">
                        <p>
                            本站源代码在 GitHub 上以{" "}
                            <span className="font-bold">AGPL-3.0</span>{" "}
                            协议开源。使用或修改本站代码时，请遵守该协议的相关条款。
                        </p>
                    </Section>

                    <Section title="7. 条款变更">
                        <p>
                            我们保留随时修改本服务条款的权利。任何变更将在本页面发布，
                            继续使用本站即表示您接受修改后的条款。
                        </p>
                    </Section>

                    <Section title="8. 联系我们">
                        <p>
                            如果您对本服务条款有任何疑问，可以通过以下方式联系我们：
                        </p>
                        <ul className="mt-2 list-inside list-disc space-y-1">
                            <li>
                                GitHub：{" "}
                                <ExternalLink
                                    href="https://github.com/moe-sekai/Moesekai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-md3-xs font-medium text-primary hover:underline focus-ring"
                                >
                                    moe-sekai/Moesekai
                                </ExternalLink>
                            </li>
                            <li>QQ 群：1075068454</li>
                        </ul>
                    </Section>
                </div>

                <div className="mt-12 text-center">
                    <Button href="/" variant="tonal" size="s" icon={mdArrowBack}>
                        返回首页
                    </Button>
                </div>
            </PageContainer>
        </MainLayout>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Surface as="section" tone="card" className="p-5 sm:p-6">
            <h2 className="mb-3 type-title-l text-on-surface">{title}</h2>
            <div className="type-body-l text-on-surface-variant">{children}</div>
        </Surface>
    );
}
