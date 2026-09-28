/**
 * 検証器のメッセージの末尾に添える、アプリ（SlotAnalyzer。slot-analyzer-ios）での影響。
 * 3.9.0 からの規則（confirmation-validator・probability-validator）とそのテストは、ここの文言を使う
 * （同じ文言を書き写さない）。
 */

/** 推定に使う値に問題があると、アプリは推定全体を止める（utils/binomial.ts の evaluateSettingAnalysis） */
export const STOPS_ESTIMATE = '（アプリの推定が止まる）';

/** 読み込み時の形の確かめ（schemas/index.ts）に合わないと、アプリは機種ファイルごと読み込まない */
export const CANNOT_LOAD = '（アプリが機種を読み込めない）';

/**
 * アプリが読まない欄・キーと、移行処理が捨てる欄（patterns が空でない最上位の終了画面の親の確定・否定の
 * 設定と確率）。推定には効かないが、書き方の誤りとして止める
 */
export const NOT_USED = '（アプリは使わない）';

/** 確定と否定の両方にある設定。アプリは否定として扱うので、確定する設定がすべて否定にもあると設定が残らない */
export const OVERLAP = '（アプリは否定を優先し、確定する設定がすべて否定にもあると推定が止まる）';
