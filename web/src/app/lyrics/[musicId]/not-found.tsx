import MainLayout from "@/components/MainLayout";
import Link from "@/components/LocalizedLink";
import { fallbackMessages, getMessageByPath, messagesByLocale } from "@/lib/i18n";
import { getRequestSeoLocale } from "@/lib/seo-metadata";
import { Icon } from "@/components/md3/Icon";
import { mdArrowBack } from "@/components/md3/icons";

export default async function LyricsNotFound() {
  const locale = await getRequestSeoLocale();
  const message = (key: string) => getMessageByPath(messagesByLocale[locale], key)
    ?? getMessageByPath(fallbackMessages, key)
    ?? key;

  return (
    <MainLayout>
      <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
        <p className="type-label-l text-primary">404</p>
        <h1 className="mt-3 type-headline-m text-on-surface sm:type-headline-l">
          {message("page.lyrics.notFound")}
        </h1>
        <Link
          href="/lyrics"
          className="state-layer focus-ring mt-7 inline-flex h-10 items-center gap-2 rounded-full bg-secondary-container px-4 type-label-l text-on-secondary-container"
        >
          <Icon path={mdArrowBack} size={20} />
          {message("page.lyrics.backToList")}
        </Link>
      </div>
    </MainLayout>
  );
}
