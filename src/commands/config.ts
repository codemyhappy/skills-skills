import { readConfig, writeConfig, log, pathExists, getSkillSyncRepoDir } from '../utils.js';

/** 校验 lang 取值（允许 zh/cn/chinese 与 en/english） */
function parseLang(v: string | undefined): 'zh' | 'en' | null {
  if (!v) return null;
  const s = v.toLowerCase().trim();
  if (s === 'zh' || s === 'cn' || s === 'chinese') return 'zh';
  if (s === 'en' || s === 'english') return 'en';
  return null;
}

/**
 * ss config — 查看或修改本地 ss 配置
 * 用法：
 *   ss config                 查看当前配置
 *   ss config --lang <zh|en>  修改输出语言
 */
export async function configCommand(options: { lang?: string; show?: boolean }): Promise<void> {
  const cfg = readConfig();

  // ss config --lang xx（修改语言）
  const requestedLang = parseLang(options.lang);
  if (options.lang !== undefined) {
    if (!requestedLang) {
      log.error({
        zh: `不支持的语言: ${options.lang}，请使用 zh 或 en`,
        en: `Unsupported language: ${options.lang}, use zh or en`,
      });
      log.info({
        zh: '用法: ss config --lang <zh|en>',
        en: 'Usage: ss config --lang <zh|en>',
      });
      process.exit(1);
    }
    writeConfig({ ...cfg, lang: requestedLang });
    log.success({
      zh: `已设置输出语言: ${requestedLang === 'zh' ? '中文' : 'English'}`,
      en: `Output language set to: ${requestedLang === 'zh' ? 'Chinese' : 'English'}`,
    });
    log.info({
      zh: '提示：后续 ss 命令将以新语言输出。',
      en: 'Hint: subsequent ss commands will use the new language.',
    });
    return;
  }

  // ss config（默认展示当前配置）
  log.title({ zh: '⚙️  ss 当前配置', en: '⚙️  ss current config' });
  console.log();
  log.info({
    zh: `输出语言 (lang):      ${cfg.lang ?? 'zh （默认）'}`,
    en: `Output language:      ${cfg.lang ?? 'zh (default)'}`,
  });
  log.info({
    zh: `远端仓库 (remoteUrl): ${cfg.remoteUrl ?? '（未配置）'}`,
    en: `Remote URL:           ${cfg.remoteUrl ?? '(not set)'}`,
  });
  log.info({
    zh: `仓库根目录:           ${getSkillSyncRepoDir()}  ${pathExists(getSkillSyncRepoDir()) ? '（已初始化）' : '（未初始化）'}`,
    en: `Repo root:            ${getSkillSyncRepoDir()}  ${pathExists(getSkillSyncRepoDir()) ? '(initialized)' : '(not initialized)'}`,
  });
  console.log();
  log.info({
    zh: '修改语言: ss config --lang <zh|en>',
    en: 'Change language: ss config --lang <zh|en>',
  });
}