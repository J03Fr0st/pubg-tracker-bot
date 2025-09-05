import type { DamageInfo, FlexibleDamageInfo } from '@j03fr0st/pubg-ts';

type DamageInfoInput = FlexibleDamageInfo | undefined;

export class DamageInfoUtils {
  public static hasData(damageInfo: DamageInfoInput): boolean {
    return !!damageInfo && (!Array.isArray(damageInfo) || damageInfo.length > 0);
  }

  public static toArray(damageInfo: DamageInfoInput): DamageInfo[] {
    if (!damageInfo) {
      return [];
    }
    return Array.isArray(damageInfo) ? damageInfo : [damageInfo];
  }

  public static getFirst(damageInfo: DamageInfoInput): DamageInfo | null {
    if (!DamageInfoUtils.hasData(damageInfo)) {
      return null;
    }
    const damageArray = DamageInfoUtils.toArray(damageInfo);
    return damageArray[0] ?? null;
  }
}
