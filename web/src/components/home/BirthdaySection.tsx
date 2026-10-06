"use client";
import React, { useMemo } from "react";
import Link from "@/components/LocalizedLink";
import Image from "next/image";
import { getUpcomingBirthdays } from "@/lib/birthdays";
import { getCharacterIconUrl } from "@/lib/assets";
import { useI18n } from "@/contexts/I18nContext";

export default function BirthdaySection() {
    const { t, formatDate } = useI18n();
    // Get all upcoming birthdays
    const allUpcoming = useMemo(() => getUpcomingBirthdays(), []);

    // Display top 6 birthdays
    const displayBirthdays = allUpcoming.slice(0, 6);

    if (allUpcoming.length === 0) return null;

    return (
        <div className="w-full max-w-5xl animate-fade-in-up">
            {/* Upcoming Birthdays List */}
            <div>
                <div className="mb-4">
                    <h2 className="type-title-l text-on-surface">{t("page.home.sections.upcomingBirthdays")}</h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {displayBirthdays.map((birthday, index) => (
                        <Link
                            key={birthday.id}
                            href={`/character/${birthday.id}`}
                            className={`
                                group state-layer focus-ring relative p-3 rounded-md3-lg transition-shadow duration-200 ease-md3-standard flex flex-col items-center gap-2
                                ${birthday.isToday
                                    ? "bg-primary-container text-on-primary-container shadow-elev-1 hover:shadow-elev-2"
                                    : "bg-surface-card text-on-surface ring-1 ring-outline-variant/70 hover:shadow-elev-1"
                                }
                                ${index < 2 ? "flex" : (index < 3 ? "hidden sm:flex" : "hidden lg:flex")} 
                            `}
                        >
                            <div className="relative w-14 h-14">
                                <Image
                                    src={getCharacterIconUrl(birthday.id)}
                                    alt={birthday.name}
                                    fill
                                    className="object-contain"
                                    unoptimized
                                />
                                {birthday.isToday && (
                                    <div className="absolute -top-1 -right-1 bg-primary text-on-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-elev-1 z-10">
                                        {t("page.home.birthdays.today")}
                                    </div>
                                )}
                            </div>
                            <div className="text-center w-full">
                                <div className={`type-title-s truncate ${birthday.isToday ? "" : "group-hover:text-primary"}`}>
                                    {birthday.name}
                                </div>
                                <div className={`type-label-m mt-0.5 ${birthday.isToday ? "" : "text-on-surface-variant"}`}>
                                    {formatDate(new Date(2000, birthday.month - 1, birthday.day), { month: "long", day: "numeric" })}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
