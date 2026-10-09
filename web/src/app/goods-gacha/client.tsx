'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button, EmptyState, Icon, LoadingIndicator, PageHeader } from '@/components/md3';
import { mdCheck, mdInventory2 } from '@/components/md3/icons';
import { md3EffectsDefault, md3SpatialDefault } from '@/lib/motion';
import MainLayout from '@/components/MainLayout';
import ExternalLink from '@/components/ExternalLink';
import { useI18n } from '@/contexts/I18nContext';

interface GachaClientProps {
    pools: Record<string, string[]>;
}

export default function GachaClient({ pools }: GachaClientProps) {
    const { t } = useI18n();
    const reducedMotion = useReducedMotion();
    const poolNames = Object.keys(pools);
    const [selectedPool, setSelectedPool] = useState<string>(poolNames[0] || '');
    const [results, setResults] = useState<string[]>([]);
    const [isAnimating, setIsAnimating] = useState(false);
    const [showResults, setShowResults] = useState(false);

    // History state: Record<PoolName, Record<ImageSrc, Count>>
    const [history, setHistory] = useState<Record<string, Record<string, number>>>({});

    const handlePoolChange = (poolName: string) => {
        setSelectedPool(poolName);
        setResults([]);
        setShowResults(false);
    };

    const draw = (count: number) => {
        if (!selectedPool || !pools[selectedPool] || isAnimating) return;

        setIsAnimating(true);
        setShowResults(false);
        setResults([]);

        const currentPool = pools[selectedPool];
        const newResults: string[] = [];

        for (let i = 0; i < count; i++) {
            const randomIndex = Math.floor(Math.random() * currentPool.length);
            newResults.push(currentPool[randomIndex]);
        }

        // Simulate animation delay
        setTimeout(() => {
            setResults(newResults);

            // Update history
            setHistory(prev => {
                const poolHistory = { ...(prev[selectedPool] || {}) };
                newResults.forEach(src => {
                    poolHistory[src] = (poolHistory[src] || 0) + 1;
                });
                return {
                    ...prev,
                    [selectedPool]: poolHistory
                };
            });

            setIsAnimating(false);
            setShowResults(true);
        }, 1500); // 1.5s animation
    };

    const resetHistory = () => {
        if (confirm(t("page.goodsGacha.resetConfirm"))) {
            setHistory(prev => ({
                ...prev,
                [selectedPool]: {}
            }));
            setResults([]);
            setShowResults(false);
        }
    };

    if (poolNames.length === 0) {
        return (
            <MainLayout>
                <div className="pt-4 min-h-screen flex items-center justify-center">
                    <EmptyState title={t("page.goodsGacha.noPools")} />
                </div>
            </MainLayout>
        );
    }

    const currentPoolImages = pools[selectedPool] || [];
    const currentPoolHistory = history[selectedPool] || {};
    const totalDraws = Object.values(currentPoolHistory).reduce((a, b) => a + b, 0);
    const uniqueObtained = Object.keys(currentPoolHistory).length;
    const completionRate = Math.round((uniqueObtained / currentPoolImages.length) * 100) || 0;

    return (
        <MainLayout>
            <div className="pt-4 min-h-screen pb-20">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl py-8">

                    {/* Page Header */}
                    <PageHeader
                        eyebrow={t("page.goodsGacha.badge")}
                        title={t("page.goodsGacha.title")}
                        highlight={t("page.goodsGacha.titleHighlight")}
                        description={t("page.goodsGacha.description")}
                    />

                    {/* Pool Selector */}
                    <div className="mb-12">
                        <h2 className="type-title-m font-bold text-on-surface mb-4 px-2 border-l-4 border-primary">{t("page.goodsGacha.selectPool")}</h2>
                        <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {poolNames.map((poolName) => (
                                <button type="button" aria-pressed={selectedPool === poolName}
                                    key={poolName}
                                    onClick={() => handlePoolChange(poolName)}
                                    className={`state-layer focus-ring relative p-4 rounded-md3-md border-2 transition-all duration-200 flex flex-col items-center gap-3 group
                                        ${selectedPool === poolName
                                            ? 'border-primary bg-secondary-container text-on-secondary-container shadow-elev-1 '
                                            : 'border-outline-variant bg-surface-container-lowest hover:border-primary hover:shadow-elev-1'
                                        }`}
                                >
                                    {/* Preview first image of pool if available */}
                                    <div className="w-16 h-16 relative rounded-full overflow-hidden bg-surface-container-high border border-outline-variant shadow-elev-0">
                                        {pools[poolName]?.[0] && (
                                            <Image
                                                src={pools[poolName][0]}
                                                alt={poolName}
                                                fill
                                                className="object-cover"
                                                sizes="64px"
                                            />
                                        )}
                                    </div>
                                    <span className={`type-body-m font-bold text-center line-clamp-2 ${selectedPool === poolName ? 'text-primary' : 'text-on-surface-variant group-hover:text-on-surface'}`}>
                                        {poolName}
                                    </span>
                                    {selectedPool === poolName && (
                                        <div className="absolute top-2 right-2 w-3 h-3 bg-primary rounded-full motion-safe:animate-pulse" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main Action Area */}
                    <div className="bg-surface-container-lowest rounded-md3-xl shadow-elev-3 border border-outline-variant p-6 md:p-10 mb-12 relative overflow-hidden min-h-[400px] flex flex-col items-center justify-center transition-all duration-500">

                        <div aria-hidden="true" className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary-container pointer-events-none" />

                        {/* Results Display (Moved Inside) */}
                        <AnimatePresence mode="wait">
                            {showResults && results.length > 0 && (
                                <motion.div
                                    initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                                    transition={reducedMotion ? { duration: 0 } : md3SpatialDefault}
                                    className="w-full mb-8 z-10"
                                >
                                    <div className="grid grid-cols-5 gap-2 md:gap-4 max-w-3xl mx-auto">
                                        {results.map((src, index) => (
                                            <motion.button
                                                key={`${src}-${index}`}
                                                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={reducedMotion ? { duration: 0 } : { ...md3SpatialDefault, delay: index * 0.05 }}
                                                className="state-layer focus-ring aspect-square relative bg-surface-container-lowest rounded-md3-md shadow-elev-1 border border-outline-variant overflow-hidden group hover:shadow-elev-1 transition-all cursor-pointer"
                                                type="button"
                                                aria-label={t("page.goodsGacha.resultAlt", { index: index + 1 })}
                                                onClick={() => window.open(src, '_blank')}
                                            >
                                                <Image
                                                    src={src}
                                                    alt={t("page.goodsGacha.resultAlt", { index: index + 1 })}
                                                    fill
                                                    className="object-contain p-1.5  transition-transform duration-300"
                                                    sizes="(max-width: 768px) 50vw, 20vw"
                                                />
                                            </motion.button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Controls */}
                        <div className={`z-10 flex flex-col items-center gap-6 w-full max-w-md mx-auto transition-all ${showResults ? 'mt-4' : ''}`}>
                            {!showResults && (
                                <div className="type-title-l font-bold text-on-surface">
                                    {t("page.goodsGacha.currentPool")} <span className="text-primary">{selectedPool}</span>
                                </div>
                            )}

                            <div className="flex items-center gap-3 sm:gap-6 w-full">
                                <Button
                                    onClick={() => draw(1)}
                                    disabled={isAnimating}
                                    variant="tonal" size="m" className="min-w-0 flex-1 h-auto py-3 sm:py-4 flex-col gap-1 whitespace-normal"
                                >
                                    <span className="type-body-m sm:type-title-m">{t("page.goodsGacha.singleDraw")}</span>
                                    <span className="type-label-s sm:type-label-m opacity-80 font-normal">{t("page.goodsGacha.singleDrawCost")}</span>
                                </Button>
                                <Button
                                    onClick={() => draw(10)}
                                    disabled={isAnimating}
                                    variant="filled" size="m" className="min-w-0 flex-1 h-auto py-3 sm:py-4 flex-col gap-1 whitespace-normal"
                                >
                                    <span className="type-body-m sm:type-title-m">{t("page.goodsGacha.tenDraw")}</span>
                                    <span className="type-label-s sm:type-label-m opacity-80 font-normal">{t("page.goodsGacha.tenDrawCost")}</span>
                                </Button>
                            </div>

                            {/* Statistics Summary */}
                            <div className="type-body-m text-on-surface-variant font-medium flex flex-wrap justify-center gap-4">
                                <span>{t("page.goodsGacha.totalDraws")} <b className="text-on-surface">{totalDraws}</b></span>
                                <span>{t("page.goodsGacha.completionRate")} <b className="text-primary">{completionRate}%</b> ({uniqueObtained}/{currentPoolImages.length})</span>
                            </div>
                        </div>

                        {/* Animation Overlay */}
                        <AnimatePresence>
                            {isAnimating && (
                                <motion.div
                                    initial={reducedMotion ? false : { opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={reducedMotion ? { duration: 0 } : md3EffectsDefault}
                                    className="absolute inset-0 z-20 bg-surface-container-highest flex items-center justify-center"
                                >
                                    <div className="flex flex-col items-center gap-4" role="status">
                                        <LoadingIndicator size={72} aria-label={t("page.goodsGacha.praying")} />
                                        <p className="text-primary type-title-l">
                                            {t("page.goodsGacha.praying")}
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Pool Details & History */}
                    <div className="bg-surface-container-lowest rounded-md3-lg shadow-elev-2 border border-outline-variant overflow-hidden">
                        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container flex flex-wrap gap-3 items-center justify-between">
                            <h2 className="type-title-m font-bold text-on-surface flex items-center gap-2">
                                <Icon path={mdInventory2} size={20} />
                                {t("page.goodsGacha.poolDetails", { count: currentPoolImages.length })}
                            </h2>
                            <Button
                                onClick={resetHistory}
                                disabled={totalDraws === 0}
                                variant="text" color="error" size="s"
                            >
                                {t("page.goodsGacha.resetHistory")}
                            </Button>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-6 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                                {currentPoolImages.map((src, idx) => {
                                    const count = currentPoolHistory[src] || 0;
                                    const isObtained = count > 0;

                                    return (
                                        <div
                                            key={idx}
                                            className={`relative aspect-square rounded-md3-sm border overflow-hidden transition-all
                                                ${isObtained
                                                    ? 'border-primary bg-surface-container-lowest shadow-elev-1'
                                                    : 'border-outline-variant bg-surface-container opacity-60 grayscale'
                                                }`}
                                        >
                                            <Image
                                                src={src}
                                                alt={t("page.goodsGacha.poolItemAlt", { index: idx + 1 })}
                                                fill
                                                className="object-contain p-1"
                                                sizes="128px"
                                            />
                                            {isObtained && (
                                                <div className="absolute bottom-0 right-0 z-10 bg-primary text-on-primary type-label-s type-emphasized px-1.5 py-0.5 rounded-tl-md3-sm shadow-elev-1 leading-none flex items-center gap-0.5">
                                                    <Icon path={mdCheck} size={12} />
                                                    {count > 1 && <span>×{count}</span>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Disclaimer Footer */}
                    <div className="mt-12 pt-8 border-t border-outline-variant text-center text-on-surface-variant type-body-m space-y-2">
                        <p>
                            {t("page.goodsGacha.disclaimer.unofficial")}
                        </p>
                        <p>
                            {t("page.goodsGacha.disclaimer.reference")}
                        </p>
                        <p className="type-label-m text-on-surface-variant mt-4">
                            {t("page.goodsGacha.disclaimer.noRealTrade")}
                        </p>
                        <p className="type-label-m text-on-surface-variant mt-2">
                            {t("page.goodsGacha.disclaimer.sourcePrefix")} <ExternalLink href="https://github.com/Caffeine-co/Shinonome_Ena" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline decoration-dotted">Caffeine-co/Shinonome_Ena</ExternalLink>
                        </p>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
