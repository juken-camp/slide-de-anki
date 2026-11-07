/* 戦国の反省会 v2: shared timeline, LINE-style room, read-only. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const core=window.SengokuSchedule;
  const box=$('group-messages'),inner=$('group-messages-inner');
  const explanation=$('sengoku-explanation');
  const explanationText=$('sengoku-explanation-text');
  const preview=new URLSearchParams(location.search).get('sengokuPreview')==='1';
  const DAY_MS=core?.DAY_MS||86400000;
  const JST_MS=9*3600000;
  const periodBySender={
    oda_nobunaga:'戦国〜安土桃山時代・1534〜1582年',
    toyotomi_hideyoshi:'安土桃山時代・1537〜1598年',
    tokugawa_ieyasu:'江戸時代・1543〜1616年',
    akechi_mitsuhide:'戦国時代・生年不詳〜1582年',
    takeda_shingen:'戦国時代・1521〜1573年',
    uesugi_kenshin:'戦国時代・1530〜1578年'
  };
  // Episode-by-episode student learning dialogue. Stable source IDs and timeline are not changed.
  // Questions now drive the conversation; notes explain the fact behind each question.
  const STUDENT_STORY_REVISIONS = {"sg-1-41-001":{"text":"このグルチャ、管理者いないの？ 戦国時代って、誰がリーダーを決めてたの？","note":"戦国時代には全国をまとめる強い政府が十分に機能せず、各地の大名が領地を治めていました。「一番偉い人」が自動で決まる世界ではありません。"},"sg-1-41-003":{"text":"追放したりグループ名を変えたりする人。戦国の大名もそんなふうに決まるの？","note":"大名は選挙で決まる役職ではありません。家柄や家臣の支持、戦いの結果などが大きく関わりました。家臣が離反すれば、強い大名でも危うくなります。"},"sg-1-41-013":{"text":"家臣を追放できるってこと？ でも家臣が反発したら危なくない？","note":"戦国大名は家臣の力に支えられました。命令すれば何でも解決したわけではなく、家臣との関係が勢力を左右します。1582年の本能寺の変も、家臣が主君を襲った事件です。"},"sg-1-41-022":{"text":"え、信玄と謙信が互いに反対したら、いつまでたっても決まらなくない？😂","note":"武田信玄と上杉謙信は、川中島の戦い（1553〜1564年）で約12年間に5回と数えられる戦いをしました。長年のライバル同士は、意見が一致しないことまでセットです。"},"sg-1-41-025":{"text":"えっ、信長を襲った明智光秀が入ってきたの？ 大丈夫これ……","note":"本能寺の変（1582年）では、明智光秀が主君の織田信長を京都の本能寺で襲いました。信長の死は天下統一の流れを大きく変えました。"},"sg-1-01-004":{"text":"さっき入室した光秀って、信長の家臣だったのに本能寺の変を起こした人だよね？ 気まずすぎない？","note":"本能寺の変（1582年）は、明智光秀が主君の織田信長を京都の本能寺で襲った事件です。光秀は「本能寺」という寺そのものではなく、事件を起こした人物です。"},"sg-1-01-011":{"text":"毛利って中国の人？ 日本の「中国地方」の毛利氏？","note":"毛利氏は日本の中国地方（現在の広島県など）で大きな力を持った戦国大名です。中国地方と中国という国を間違えやすいので注意。"},"sg-1-01-014":{"text":"「中国大返し」って、そんなに急いで戻ったら光秀は困るよね？","note":"1582年、秀吉は毛利氏と戦っていた中国地方から軍を急いで引き返し、山崎の戦いで光秀を破りました。「中国大返し」は日本の中国地方からの移動です。"},"sg-1-01-025":{"text":"教科書だと偉人なのに、元上司と家臣の関係が怖すぎる😂","note":"信長の家臣だった光秀は1582年に本能寺の変を起こし、同じく家臣だった秀吉は山崎の戦いで光秀を破りました。三人の関係を押さえると、出来事の順番も覚えやすくなります。"},"sg-1-03-006":{"text":"「三日天下」って、本当に天下を取れたのが3日だけだったの？","note":"「三日天下」は短い間で勢いを失うことのたとえ。光秀は1582年の本能寺の変から約11日後、山崎の戦いで秀吉に敗れました。文字どおり3日ではありません。"},"sg-1-03-012":{"text":"待って。光秀って、そもそも全国統一までできたの？","note":"光秀は信長を倒しましたが、日本全国を統一したわけではありません。1582年の本能寺の変から山崎の戦いまでの短い期間と、1590年の秀吉による全国統一を区別しましょう。"},"sg-1-03-018":{"text":"光秀は約11日、江戸幕府は約260年……比べるのはつらすぎる😂","note":"「三日天下」の約11日は光秀が1582年に敗れるまでの短さ。約260年は1603年に成立した江戸幕府が1867年まで続いた期間で、家康本人の将軍在任期間ではありません。"},"sg-extra-03-01":{"text":"あっ、光秀が退会した！ 「三日天下」をずっと言われるのは嫌だよね……","note":"光秀は本能寺の変（1582年）で信長を倒したものの、約11日後に山崎で秀吉に敗れました。この短さから「三日天下」と呼ばれます。"},"sg-1-09-005":{"text":"川中島の戦いって、1回だけの大きな戦いじゃないの？","note":"川中島の戦いは、1553〜1564年に武田信玄と上杉謙信が繰り返した一連の戦いで、通常5回と数えます。たった1日の戦いではありません。"},"sg-1-09-007":{"text":"5回も!? しかも約12年間って、何をめぐって争ったの？","note":"信玄と謙信は、現在の長野県北部にあたる北信濃などの支配をめぐり対立しました。川中島の戦いは1553〜1564年、約12年間に5回と数えられます。"},"sg-1-09-013":{"text":"約12年も争ったの!? 同じクラスなら絶対隣の席に座りたくないね😂","note":"川中島の戦い（1553〜1564年）の信玄と謙信。歴史上のライバルを、教科書では人物名と地名をセットで覚えるのがおすすめです。"},"sg-1-09-019":{"text":"5回も戦ったのに、結局どっちが勝ったの？","note":"川中島の戦いは5回と数えられますが、毎回一方が決定的に勝ったわけではありません。北信濃の勢力関係は変化し、単純に「5戦全勝」とは言えないのです。"},"sg-1-09-023":{"text":"第6回はやめて！ 川中島は5回って覚えたんだから😂","note":"「川中島の戦い」は通常5回（1553〜1564年）と数えます。6回目は創作の会話だけ。受験では武田信玄と上杉謙信の対立を結びつけましょう。"},"sg-extra-09-04":{"text":"「放っておけ」って言ったのに招待してる！ そんなにライバルが気になるの？","note":"約12年間、川中島で戦った信玄と謙信。相手を強く意識し続ける関係を描いた場面です。史実の対立は1553〜1564年の一連の戦いとして覚えましょう。"},"sg-extra-09-08":{"text":"仲悪いのに教科書ではいつもセット！ 信玄と謙信、もう覚えた😂","note":"武田信玄と上杉謙信は川中島の戦い（1553〜1564年）で知られるライバル。名前だけでなく、争った場所が現在の長野県北部という点も押さえましょう。"},"sg-2-14-006":{"text":"三方ヶ原って、家康が武田信玄に負けた戦いだよね？","note":"三方ヶ原の戦い（1572年）で徳川家康は武田信玄に大敗しました。後の天下人にも若い頃には大きな敗北がありました。"},"sg-2-14-013":{"text":"長篠では武田軍が負けたの？ そのとき信玄もいた？","note":"長篠の戦い（1575年）で織田・徳川連合軍が破ったのは、武田勝頼の軍です。信玄は1573年に亡くなっていたので、この戦いには参加していません。"},"sg-2-14-020":{"text":"整理できた！ 三方ヶ原1572年は家康が負けて、長篠1575年は武田家が負けた！","note":"三方ヶ原（1572年）は信玄が家康に勝ち、長篠（1575年）は信玄の子・勝頼が率いた武田軍が織田・徳川連合軍に敗れました。3年で勝敗が入れ替わります。"},"sg-2-24-001":{"text":"信長って教科書ではすごいけど、家臣にとってはどんな上司だったの？","note":"信長は戦国時代に勢力を大きく広げました。一方、家臣と主君の関係は複雑で、1582年には家臣の光秀による本能寺の変が起きました。"},"sg-extra-24-01":{"text":"あれ、光秀も戻ってる！ 元上司の信長とちゃんと話せるのかな……","note":"本能寺の変（1582年）で光秀が主君の信長を襲ったことは史実です。二人が死後に会話するのは創作ですが、主従関係を思い出すきっかけになります。"},"sg-2-24-005":{"text":"信長は家臣が戦で失敗したら、本当に厳しかったの？","note":"戦国時代の戦いでは、一度の失敗で城や領地を失うことがありました。信長の性格を単純に断定せず、家臣が置かれた立場も考えてみましょう。"},"sg-2-24-011":{"text":"この雰囲気で「不満があります」って言うのは勇気いるよね……","note":"信長と秀吉は主君と家臣の関係でした。信長は秀吉を登用し、秀吉は後に全国統一を進めました。上下関係が分かると二人の発言の意味も変わります。"},"sg-2-24-017":{"text":"本能寺の変の理由って、結局は光秀が信長を嫌ってたからなの？","note":"本能寺の変（1582年）の動機は確定していません。怨恨説だけでなく政治的背景などさまざまな見方があり、証拠のない決めつけには注意が必要です。"},"sg-2-24-022":{"text":"理由がはっきりしないなら、「信長が怖かったから」って決めつけちゃダメだね","note":"本能寺の変（1582年）で光秀が信長を襲った事実と、「なぜ襲ったのか」という動機は区別しましょう。動機には諸説あります。"},"sg-2-25-004":{"text":"秀吉って最初から武士だったの？ 身分が低いところから天下人になったって本当？","note":"秀吉は低い身分から出世した人物として知られます。詳しい出自には不明な点もありますが、1585年には関白、1590年には全国統一を進めました。"},"sg-2-25-006":{"text":"「関白」って、征夷大将軍とは何が違うの？","note":"関白は天皇を補佐する高い役職で、征夷大将軍とは別の地位です。秀吉は1585年に関白となり、家康は1603年に征夷大将軍となりました。"},"sg-2-25-013":{"text":"太閤検地って、土地の面積を調べて何を知りたかったの？","note":"太閤検地では田畑の面積や石高などを調べ、土地ごとの生産力を把握しました。収穫と年貢の基準を整える重要な政策でした。"},"sg-2-25-017":{"text":"刀狩って、農民も武器を持ってたから取り上げたの？","note":"秀吉は1588年に刀狩令を出しました。農民などから武器を集めて一揆を抑える狙いがあり、武士と農民の区別が進む一因になりました。"},"sg-2-25-020":{"text":"なるほど！ 検地で米の量を把握して、刀狩で武器を集めて、兵農分離につながるんだ","note":"太閤検地と刀狩は、秀吉の全国支配を支えた政策です。戦う武士と農業を行う農民の役割が分かれる「兵農分離」の流れにつながりました。"},"sg-2-25-026":{"text":"全国統一した秀吉でも、元上司の信長には頭が上がらないんだね😂","note":"秀吉は信長の家臣から大きく出世し、1590年に全国統一を進めました。信長→秀吉→家康という流れを押さえると、戦国から江戸への変化が整理できます。"},"sg-2-28-001":{"text":"木下藤吉郎、羽柴秀吉、豊臣秀吉って、全部同じ人なの？","note":"秀吉は若い頃に藤吉郎、後に羽柴秀吉と名乗り、1586年には豊臣の姓を与えられました。名前の変化から出世の過程がたどれます。"},"sg-2-28-006":{"text":"天下人になっても「藤吉郎」って呼ばれたら、反射で返事しちゃうんだ😂","note":"藤吉郎は秀吉が若い頃に使った名前。信長に仕えていた時代の呼び名です。後の豊臣秀吉と同一人物だと覚えましょう。"},"sg-2-28-010":{"text":"羽柴って名前、丹羽と柴田の字を合わせたって説があるんだ！","note":"羽柴の名は丹羽長秀と柴田勝家から一字ずつ取ったと伝えられます。ただし由来には諸説あり、伝承と確かな史実を区別しましょう。"},"sg-2-28-014":{"text":"じゃあ「豊臣」は、いつから名乗ったの？","note":"秀吉が豊臣姓を与えられたのは1586年。前年の1585年には関白になっています。年代の順番を整理しましょう。"},"sg-2-28-016":{"text":"豊臣って、朝廷から認められた姓だったんだ！ ただの改名じゃないんだね","note":"豊臣は1586年に朝廷から与えられた姓です。名前の変化は、秀吉の政治的地位や権威の変化とも結びついています。"},"sg-3-34-005":{"text":"桶狭間って1560年だよね？ 信長が今川義元に勝った戦い！","note":"桶狭間の戦い（1560年）では、織田信長が今川義元を破りました。今川軍の兵力が大きかったと伝わりますが、正確な人数には諸説あります。"},"sg-3-34-007":{"text":"楽市・楽座って、商売しやすくする政策のこと？","note":"楽市・楽座は市場の特権や負担を見直し、商売を活発にする政策です。信長だけが初めて行った制度というわけではありません。"},"sg-3-34-017":{"text":"会社に例えると、信長が始めて秀吉が全国統一、家康が長期運営ってこと？😂","note":"信長は勢力を拡大、秀吉は1590年に全国統一を進め、家康は1603年に江戸幕府を開きました。三英傑を順に並べると時代の流れが見えます。"},"sg-3-34-023":{"text":"本能寺の変（1582年）で信長が死ななければ、歴史は変わったかもしれないね……","note":"本能寺の変（1582年）で信長が亡くなり、後に秀吉が台頭しました。「もしも」は断定できませんが、事件の前後で勢力図が変わったことは重要です。"},"sg-3-38-004":{"text":"1603年から1867年まで!? 江戸幕府って約260年も続いたの？","note":"江戸幕府は1603年に成立し、1867年の大政奉還で政権を朝廷へ返しました。約260年という長さが特徴です。"},"sg-3-38-007":{"text":"江戸時代は、戦国時代と比べて庶民の暮らしがどう変わったの？","note":"江戸幕府のもとで大名同士の大規模な戦いが抑えられ、都市や交通・商業が発達しました。ただし庶民の暮らしに困難がなくなったわけではありません。"},"sg-3-38-012":{"text":"家康本人が260年間ずっと将軍だったわけじゃないよね？","note":"家康が征夷大将軍だったのは1603〜1605年。その後、息子の秀忠へ将軍職を譲りました。約260年続いたのは幕府という仕組みです。"},"sg-3-38-018":{"text":"江戸幕府はどうして長続きしたの？ 家康一人が強かったから？","note":"江戸幕府が長続きした背景には、大名を統制する制度や将軍職を継ぐ仕組みなどがありました。個人の強さだけで説明できません。"},"sg-3-45-001":{"text":"受験勉強で人物と出来事が混ざる……。みんなの重要ワード、確認してもいい？","note":"人物と出来事をセットにして覚えると歴史が整理できます。織田信長・豊臣秀吉・徳川家康は、戦国から江戸へつながる順番も大切です。"},"sg-3-45-003":{"text":"信長は「本能寺の変（1582年）」……で合ってる？","note":"本能寺の変は1582年、明智光秀が信長を襲った事件です。信長が起こした事件ではないことに注意しましょう。"},"sg-3-45-005":{"text":"その本能寺の変を起こしたのが、信長の家臣の明智光秀だよね？","note":"明智光秀は1582年の本能寺の変で主君の織田信長を襲いました。その後、光秀は山崎の戦いで秀吉に敗れます。"},"sg-3-45-008":{"text":"光秀は「本能寺の変」と「三日天下」。でも実際は約11日だったよね？","note":"三日天下は「短い権力」のたとえ。1582年の本能寺の変から山崎の戦いまで約11日でした。文字どおり3日間ではありません。"},"sg-3-45-011":{"text":"秀吉は「太閤検地」「刀狩（1588年）」「全国統一（1590年）」！","note":"豊臣秀吉は太閤検地や1588年の刀狩を進め、1590年に全国統一を進めました。三つをセットで覚えましょう。"},"sg-3-45-013":{"text":"あと……「猿」って呼ばれた話も有名だけど、教科書の確かな事実とは別だよね","note":"秀吉の「猿」という呼び名は逸話として知られますが、由来や実際の使われ方は確定していません。試験では、秀吉の政策や年号を優先しましょう。"},"sg-3-45-016":{"text":"信玄は「風林火山」「川中島」「上杉謙信」。セットで覚える？","note":"武田信玄と上杉謙信は川中島の戦い（1553〜1564年）で対立したライバル。「風林火山」は信玄に結びつく軍旗の言葉として知られます。"},"sg-3-45-018":{"text":"謙信も「川中島」と「武田信玄」！ 5回戦ったんだよね","note":"上杉謙信は越後の戦国大名で、武田信玄と川中島の戦いで争いました。川中島は現在の長野県北部に位置します。"},"sg-3-45-023":{"text":"仲悪いのに歴史のテストでは二人セットで覚えるのか😂","note":"川中島の戦い（1553〜1564年）は武田信玄・上杉謙信・長野県北部をまとめて覚えると整理できます。"},"sg-3-45-025":{"text":"家康は「関ヶ原（1600年）」「江戸幕府（1603年）」！ ホトトギスの句って本人の言葉？","note":"1600年の関ヶ原の戦い、1603年の江戸幕府成立は家康の重要事項。ホトトギスの句は後世の人物評で、本人が実際に詠んだと断定できません。"},"sg-3-45-029":{"text":"えっ、ホトトギスの句は後世の人の作品で、本人の言葉じゃないんだ！","note":"「鳴かぬなら～」で知られる三英傑の句は、後世に作られた人物評です。語呂としては便利ですが、当時の本人の発言として覚えないようにしましょう。"},"sg-3-48-001":{"text":"ここ「反省会」だよね。成功だけじゃなくて、失敗したことも聞いていい？","note":"歴史は勝者の功績だけでは分かりません。戦国の大名の判断が家臣や農民にどう影響したかも考えてみましょう。"},"sg-3-48-003":{"text":"教科書って勝った人が目立つけど、困った人や負けた人の話も大事だよね","note":"戦国の戦いでは勝者も敗者も多数の人々の暮らしを動かしました。人物だけでなく、政策が人々に与えた影響を考えることが大切です。"},"sg-3-48-009":{"text":"みんな急に黙った……。自分の失敗を話すのは難しいんだね","note":"信長・秀吉・家康にも失敗や難しい判断がありました。歴史上の人物の気持ちを断定するのではなく、起きた出来事とその結果から考えましょう。"},"sg-3-48-014":{"text":"光秀は？ 本能寺の変で何が変わったと思う？","note":"本能寺の変（1582年）で信長が亡くなり、天下統一へ向かう流れが大きく変わりました。秀吉らが次の主導権を争うきっかけにもなります。"},"sg-3-48-018":{"text":"秀吉は？ 太閤検地や刀狩って、農民から見るとどうだったの？","note":"太閤検地は土地の面積や石高を把握する政策、刀狩は農民などの武器を集める政策です。国を治める側と、政策を受ける側の視点は異なります。"},"sg-3-48-020":{"text":"でも武器を取られた農民は不安だよね。検地で年貢の基準も変わったし","note":"1588年の刀狩で武器を取り上げられ、太閤検地では収穫量をもとに年貢の基準が整えられました。政策の目的と人々への影響を両方見ましょう。"},"sg-3-48-027":{"text":"信玄と謙信は？ 川中島の戦いで反省してることある？","note":"信玄と謙信は1553〜1564年に川中島をめぐり争いました。何度も戦った相手だからこそ、「もっと戦うべきだった」と考える創作のやり取りが続きます。"},"sg-3-48-030":{"text":"それ、反省じゃなくて次の戦いの相談になってない？😂","note":"川中島の戦いは通常5回と数えられます。6回目は実際に起きた戦いではありません。何回も戦った二人のライバル関係が分かる場面です。"},"sg-3-48-033":{"text":"第6回はダメ！ 約12年間で5回戦ったって、ちゃんと覚えたから！😂","note":"川中島の戦い（1553〜1564年）は信玄と謙信の対立。約12年間に5回と数えられる戦いがあったことを覚えましょう。"},"sg-3-48-039":{"text":"まとめ！ 信長が広げて、秀吉が統一、家康が幕府。でも管理者だけ決まらない😂","note":"信長は勢力を拡大、秀吉は1590年に全国統一を進め、家康は1603年に江戸幕府を開きました。戦国から江戸への流れが一続きで整理できます。"},"sg-1-09-008":{"text":"北信濃をめぐる争いじゃ。遊びに行ったわけではない","note":"川中島の戦い（1553〜1564年）は北信濃の支配をめぐる争いでした。現在の長野県北部が舞台です。謙信側にとっても、単なる意地の張り合いではありませんでした。"},"sg-1-09-020":{"text":"毎回決定的な勝者が出たわけではありませぬ。まさに腐れ縁ですな","note":"川中島の戦いは5回と数えられますが、毎回どちらかが完全に勝ったわけではありません。約12年続いた対立を単純な勝敗だけで整理しないのが大切です。"},"sg-2-25-007":{"text":"関白は天皇を補佐する高い役職。将軍とは別でございます","note":"関白は天皇を補佐する高い役職で、征夷大将軍とは別です。秀吉は1585年に関白となり、家康は1603年に征夷大将軍になりました。"},"sg-2-28-017":{"text":"朝廷から姓を得たのは大きなこと。木下、羽柴、豊臣。三段階の出世ですな","note":"秀吉は木下藤吉郎から羽柴秀吉と名乗り、1586年には豊臣姓を与えられました。名前を変えた出来事と政治的な出世を関連づけて覚えましょう。"},"sg-3-34-006":{"text":"うむ。1560年には今川義元を破った。その後は楽市・楽座も進めたぞ","note":"桶狭間の戦い（1560年）で信長は今川義元を破りました。楽市・楽座は市場の負担などを見直し商業を促す政策で、合戦と経済政策の両方が信長の重要事項です。"},"sg-1-01-001":{"text":"皆様、改めまして。お久しぶりでございます……どうか穏便に。","note":"光秀は織田信長に仕えていましたが、1582年の本能寺の変で主君を襲いました。事件を知ると、このぎこちない挨拶の気まずさがよく分かります。"},"sg-1-01-005":{"text":"……その件については、今はそっとしておいていただきたい。","note":"光秀は1582年の本能寺の変で信長を襲いましたが、なぜ起こしたのかという動機には諸説あります。事件があった事実と、その理由についての推測は分けて覚えましょう。"}};
  // Editorial upgrades: historical context first, not explanations of internet slang or of the joke.
  // Intentionally kept separate from schedule.json to avoid altering 328 source dialogue lines.
  const EDUCATIONAL_EXPLANATIONS = {"sg-1-41-001":"戦国時代には、各地の大名が「誰がこの国を動かすのか」を争っていました。城や領地はもちろん、家臣への命令権も大問題。そんな武将たちを同じグループに集めたら、まず管理者争いになるのも無理はありません。","sg-1-41-005":"秀吉は信長の家臣から出世した人物です。後に天下統一を進めるほどの大物になっても、ここでは昔の上司を全力で持ち上げています。戦国の出世は、戦に強いだけでなく、主君から信頼されることも大切でした。","sg-1-41-007":"謙信は越後（今の新潟県付近）の戦国大名。信玄とは川中島の戦い（1553〜1564年）で何度もぶつかりました。「偉いと言った者が勝ち」とは認めない、長年のライバルらしい一言です。","sg-1-41-013":"戦国時代、気に入らない家臣を簡単に遠ざければ、かえって反発を招くこともありました。信長と光秀の関係を知ると、この「追放できる」という機能が急に物騒に聞こえてきます。","sg-1-41-015":"秀吉にとって信長は、出世の道を開いてくれた主君。その主君が「気に入らない人を追放できる」と知ったら、全力で止めたくもなります。後に天下人となる秀吉でも、ここではまだ信長の部下なのです。","sg-1-41-016":"家康が1603年に開いた江戸幕府は、1867年まで約260年続きました。自分だけが強くても、次の世代が続かなければ政権は長持ちしません。「追放されない仕組み」を気にする家康の言葉は、歴史の結末を知ると意味深です。","sg-1-41-018":"家康の開いた江戸幕府は1603〜1867年、約260年間も続きました。天下を取ることと、取った後に長く保つことは別の難しさ。大きな実績を持つ家康が「一般論」と言うほど、周囲には自慢に聞こえそうです。","sg-1-41-019":"戦国時代の大名は、現代の選挙で選ばれたわけではありません。家のつながり、家臣の支持、戦での勝敗などが力を左右しました。もし投票制だったら、信玄と謙信はまず互いを落としそうですね。","sg-1-41-021":"川中島の戦いは1553〜1564年に5回と数えられています。現在の長野県北部をめぐり、約12年も張り合った信玄と謙信。敵を認めたくない気持ちは、現代の投票でも変わらないようです。","sg-1-41-022":"信玄と謙信は、川中島の戦い（1553〜1564年）で約12年間に5回も対立したライバル。投票でも互いに反対していては、いつまでたっても多数派を作れません。戦場でもチャットでも、譲れない相手なのです。","sg-1-41-025":"光秀と信長を同じ部屋へ入れるのは、かなり危険な組み合わせ。1582年の本能寺の変では、家臣だった光秀が主君の信長を襲い、信長は命を落としました。文字通り、歴史がひっくり返った当事者同士です。","sg-1-01-002":"1582年の本能寺の変で、光秀は自分の主君だった信長を襲いました。信長は京都の本能寺で命を落とします。そんな相手に「お久しぶり」と言われたら、400年以上たっても「いや、そういう問題じゃない！」となりそうです。","sg-1-01-004":"1582年の本能寺の変。光秀は京都の本能寺に滞在していた信長を急襲し、信長は亡くなりました。光秀が入室するだけで、信長にとっては人生最大の事件が目の前に戻ってくるわけです。","sg-1-01-007":"信長にとって1582年の本能寺の変は、天下統一目前で人生が終わった大事件。戦国の勢力図も一気に変わりました。「終わった事件」と整理できるのは後世の私たちだけなのかもしれません。","sg-1-01-008":"本能寺の変（1582年）で光秀が信長を襲った理由は、今もはっきり確定していません。怨恨説や政治的な事情など、さまざまな見方があります。「本人に聞けば一発で解決」とはいかないのが歴史の難しさです。","sg-1-01-009":"信玄が亡くなったのは1573年。本能寺の変は1582年なので、信玄は生前にこの事件を目撃していません。信玄が光秀に「度胸がある」と言うのは、時代を飛び越えて歴史の結末を知るこの部屋ならではの反応です。","sg-1-01-015":"本能寺の変が起きた1582年、秀吉は中国地方の毛利氏と戦っていました。そこから軍を急いで引き返す「中国大返し」を行い、山崎の戦いで光秀を破ります。およそ200km前後の大移動とされますが、経路や日数には諸説。光秀には悪夢の帰還だったでしょう。","sg-1-01-018":"山崎の戦い（1582年）で光秀は秀吉に敗れました。本能寺の変からわずか約11日後のことです。自分を倒した相手に、敗戦の経緯まで解説される……。負けた本人なら「知っています」と言いたくなるでしょう。","sg-1-01-020":"本能寺の変（1582年）最大の謎の一つは「光秀はなぜ信長を襲ったのか」。研究者の間でも議論が続いています。教科書で確かなのは事件が起きたこと。本人の本心まで、証拠なしで決めつけないのが大切です。","sg-1-01-021":"1582年の本能寺の変で、光秀は主君だった信長を襲いました。織田家の内部で起きた事件だけに、戦国の主従関係を考えると気まずさは相当なもの。信長が怒る理由を知れば、この一言の重さも変わります。","sg-1-01-022":"秀吉は信長の家臣として頭角を現し、本能寺の変（1582年）の後に光秀を破って勢力を伸ばしました。信長と光秀が火花を散らす場で「お茶でも」と気をそらす姿からは、主君への気遣いと立ち回りのうまさがうかがえます。","sg-1-01-023":"1582年の山崎の戦いで光秀を倒したのは秀吉。その勝利が、後の天下統一へつながる大きな一歩になりました。信長からすれば、元家臣の成功を褒めたいような、複雑な気分になりそうです。","sg-1-01-025":"信長に仕えていた秀吉と光秀。1582年、本能寺の変を起こした光秀を秀吉が山崎で破り、二人の運命は真逆になりました。上司がいなくなった後にも、信長をめぐる立場の違いが残るのが面白いところです。","sg-1-03-005":"「三日天下」の光秀を実際に倒したのは、1582年の山崎の戦いに勝った秀吉です。約11日で勢力を失った光秀にとって、勝者の秀吉から笑われるのは一番こたえるでしょう。","sg-1-03-009":"「三日天下」は、実際に3日間しか支配しなかったという意味ではありません。本能寺の変から山崎の戦いまで、1582年の出来事は約11日間。3日よりは長いけれど、天下の行方を決めるにはあまりにも短い時間でした。","sg-1-03-012":"1582年、光秀は信長を倒したものの、約11日後には山崎の戦いで秀吉に敗れました。天下の行方を変えるほど大きな行動を起こしたのに、その後が驚くほど短い。「三日天下」という言葉が残る理由が分かります。","sg-1-03-013":"ここは要注意！「三日天下」といっても、光秀が日本全国を統一したわけではありません。1582年の本能寺の変で信長を倒した後、山崎の戦いで敗れるまでが短かったことを表しています。","sg-1-03-015":"信長は1582年の本能寺の変で亡くなり、全国統一は完成できませんでした。その後、秀吉が1590年に全国統一を進めます。元上司の目の前で「私が仕上げました！」と自慢されたら、信長の心中は複雑でしょう。","sg-1-03-019":"光秀は1582年の本能寺の変から約11日で敗北。一方、家康が開いた江戸幕府は1603〜1867年の約260年間続きました。比べる単位が「日」と「世紀」なのだから、笑顔で言われる光秀にはつらすぎます。","sg-1-03-020":"光秀が権力を握っていた期間は約11日、家康の幕府は約260年。数字だけ並べると、とんでもない差です。「比べていません」と笑顔で言う家康に、光秀が納得できるはずもありません。","sg-1-03-021":"信長を倒した光秀は、1582年の山崎の戦いで敗れました。もしも信長から「安心しろ」と言われたら、光秀はようやく許されたと思うかもしれません。でも本能寺の変は、簡単に水に流せる出来事ではありません。","sg-1-03-022":"1582年、家臣だった光秀は信長を本能寺で襲いました。歴史を知るほど、この二人が穏やかに話す姿は想像しにくいもの。光秀が一瞬だけ救われた気持ちになるところに、関係の複雑さが表れています。","sg-1-03-023":"1582年、本能寺の変で信長を倒した光秀は、約11日後に秀吉に敗れました。信長は生涯の終わりを、光秀は短い権力の終わりを迎えた事件です。両者にとって忘れられない11日間でした。","sg-1-03-024":"「三日天下」は短期間で権力を失うことのたとえ。本能寺の変から山崎の戦いまでは1582年の約11日間で、文字通り3日だったわけではありません。本人には忘れてほしい記録でも、歴史では忘れられません。","sg-extra-03-01":"光秀は1582年の本能寺の変で信長を倒しましたが、山崎の戦いで約11日後に敗れました。「三日天下」と今も呼ばれるほど短い期間です。グルチャなら退会できても、歴史の記録からは退出できません。","sg-extra-03-02":"信長は1582年、本能寺の変で光秀に襲われて亡くなりました。歴史の中では立場が逆転した二人ですが、この部屋では信長がまだ主君の顔。追う方も逃げる方も気まずい再会です。","sg-extra-03-03":"家康は信長と同盟を結んでいた武将。本能寺の変（1582年）で信長が亡くなると、各地の大名が次の主導権をめぐって動き始めました。家康もその大きな時代の転換に直面した一人です。","sg-extra-03-04":"信長の家臣だった秀吉は、1582年の本能寺の変後、光秀を山崎で破り、1590年には全国統一を進めました。ここでは天下人にまでなった男が、昔の主君の命令で「連れ戻す係」に逆戻りです。","sg-extra-03-05":"秀吉は1582年の山崎の戦いで光秀を破りました。かつて戦場で倒した相手を、今度はチャットへ呼び戻せと言われるのだから大忙し。信長への忠誠と光秀との因縁が、一度にぶつかる場面です。","sg-1-09-009":"川中島の戦い（1553〜1564年）は、信玄と謙信が約12年間に5回対立した一連の戦いです。家康に「そんなに何度も会うなんて仲良し」と言われたら、当人たちはたまったものではないでしょう。","sg-1-09-011":"信玄と謙信は川中島の戦い（1553〜1564年）で長く争った二人。ところが、互いを嫌がる返事だけは見事に一致しています。敵を知り尽くしているからこそ、反応まで似てしまうのかもしれません。","sg-1-09-013":"信玄と謙信が争った川中島（今の長野県北部）では、1553〜1564年に5回と数えられる戦いがありました。同じ教室なら先生に席を離されそうなほどのライバル。しかし歴史の教科書では、いつも隣に並ぶ二人です。","sg-1-09-015":"約12年間に5回も戦った信玄と謙信。1553〜1564年の川中島の戦いでは、互いの動きを警戒し続けました。「絶対に隣に座らない」だけは一致するのだから、なんだか不思議な関係です。","sg-1-09-020":"信玄と謙信が川中島をめぐって争ったのは、1553〜1564年の約12年間。相手の動きを気にして戦略を考え続けたのですから、もはや切り離して語れません。歴史のテストでも二人の名前はセットで覚えたいところです。","sg-1-09-021":"川中島の戦いは1553〜1564年に5回と数えられています。何度ぶつかっても相手を完全には倒しきれなかった二人。謙信が「もう1回」と言いだせば、信玄がげんなりするのも分かります。","sg-1-09-022":"信玄と謙信は川中島で約12年間に5回対立しました。大名にとって戦いは兵や物資を動かす一大事。「またか！」という信玄の叫びには、長く続いた戦いの負担まで想像できます。","sg-1-09-023":"川中島の戦いは1553〜1564年に5回と数えられるのが一般的です。つまり「第6回」は歴史には存在しません。5回でも十分多いのに、まだ続きを始めそうな二人。約12年の対立の長さを思い出しましょう。","sg-extra-09-01":"信玄と謙信は、川中島（現在の長野県北部）をめぐって1553〜1564年に何度も対立しました。相手が去っただけでも「勝った」と思いたくなるほど、強烈なライバルとして描かれています。","sg-extra-09-02":"約12年間、信玄と謙信は川中島をめぐって争いました。1553〜1564年の5回と数えられる戦いを思えば、退会した相手が気になってしまうのも不思議ではありません。","sg-extra-09-03":"信玄と謙信は1553〜1564年に川中島をめぐって対立しました。約12年も意識してきた相手が突然いなくなれば、「放っておけ」と言いながらも落ち着かない。長いライバル関係が伝わる場面です。","sg-extra-09-04":"退会した信玄を謙信が再招待。約12年間に5回対立した川中島の戦い（1553〜1564年）を知っていると、相手がいない方が寂しいように見えてきます。敵同士なのに離れられない二人です。","sg-extra-09-05":"信玄と謙信が川中島で争ったのは1553〜1564年。戦では勝敗や土地の支配が大きな問題でした。退会を「逃げた」と呼ばれれば、信玄が黙っていられないのも納得です。","sg-extra-09-06":"川中島の戦い（1553〜1564年）で信玄と謙信が何度もぶつかったのは、現在の長野県北部の支配をめぐるため。約12年の対立がある二人には、チャットの退会さえ勝敗に見えてしまいます。","sg-extra-09-07":"信玄と謙信は1553〜1564年、川中島で5回と数えられる戦いを繰り広げました。退会してもライバルに呼び戻されるとは、戦場より厄介かもしれません。","sg-extra-09-08":"川中島の戦い（1553〜1564年）では、信玄と謙信が約12年間に5回対立したとされます。仲良しとは言えなくても、互いが相手の行動に敏感だったのは確か。歴史上でも切り離せない名コンビです。","sg-2-14-006":"家康が信玄に大敗したのは三方ヶ原の戦い（1572年）。後に江戸幕府を開く家康にも、若い頃には命がけの失敗がありました。信玄にその話を持ち出されると、さすがの家康も言葉を失います。","sg-2-14-018":"三方ヶ原（1572年）では信玄が家康に勝利。しかし長篠の戦い（1575年）では、信玄の死後に武田勝頼の軍が織田・徳川連合軍に敗れました。勝った話と負けた話は、わずか3年違いです。","sg-2-14-021":"三方ヶ原の戦い（1572年）で家康は信玄に敗れました。でも長篠の戦い（1575年）では、信玄の後継者・勝頼の軍が織田・徳川に敗れます。3年で立場が変わったことを知れば、家康の一言がずっと強く響きます。","sg-2-14-023":"信玄と謙信は川中島（現在の長野県北部）で1553〜1564年に対立しました。三方ヶ原の話題が終わった途端に「では川中島で」と振られたら、謙信は巻き添えを食う格好です。","sg-2-24-002":"信長は戦国時代、家臣を率いて領地を拡大した大名。戦での失敗は勢力を失う危険と隣り合わせでした。自分が裁かれる側になる「相談室」では、いつもの強い立場が通じません。","sg-extra-24-01":"光秀は本能寺の変（1582年）で信長を襲った人物。山崎の戦いで秀吉に敗れ、約11日で勢力を失いました。その秀吉に退会後まで招待されるとは、光秀には逃げ場がありません。","sg-2-24-004":"秀吉も光秀も信長の家臣でした。1582年の本能寺の変で信長を襲った光秀を、後に秀吉が山崎の戦いで破ります。信長への接し方が対照的な二人だから、秀吉の持ち上げぶりは光秀には目立って見えるでしょう。","sg-2-24-008":"本能寺の変（1582年）で光秀が信長を襲った動機は、今も確定していません。単に「不満があったから」と言い切れるほど、歴史は単純ではないのです。だからこそ、この質問は簡単に答えられません。","sg-2-24-013":"秀吉は信長に仕え、やがて1585年に関白、1590年には全国統一を進めるまで出世しました。それでも昔の主君の前では深々と頭を下げています。出世の大きさと、抜けない上下関係の落差が面白いところです。","sg-2-24-014":"秀吉は信長の死後、1582年の山崎の戦いに勝って勢力を伸ばし、1590年に全国統一を進めました。信長から受けた恩と、自分の力で道を切り開いた部分。その両方があるから、家康の一言は意地悪に聞こえます。","sg-2-24-015":"本能寺の変（1582年）で、光秀は主君の信長を襲いました。「なぜだったのか」は何世紀も議論されてきた問題。目の前で本人に聞けたら便利ですが、史料が残る現実の歴史では答えは一つに定まっていません。","sg-2-24-016":"本能寺の変（1582年）の動機には、光秀個人の事情や政治的背景など、さまざまな説があります。ひとつの答えを決めつけるより、「なぜそう考えたのか」という証拠を見るのが歴史の勉強です。","sg-2-24-018":"本能寺の変（1582年）について分かるのは「何が起きたか」であり、「光秀の心の中」のすべてではありません。当時の記録も、それを書いた人の立場によって見え方が違います。謙信の言葉はそこを突いています。","sg-2-24-019":"信玄と謙信は川中島の戦い（1553〜1564年）で争いました。ライバルだからこそ、相手が少しまともなことを言っただけでも認めたくない。約12年の対立が、短い一言ににじんでいます。","sg-2-24-020":"信玄と謙信は川中島をめぐって1553〜1564年に対立しました。長年のライバル同士は、褒めるときにまで一言余計。謙信が素直に喜ばない理由が見えてきます。","sg-2-24-021":"信長は1582年、本能寺の変で家臣の光秀に襲われ、命を落としました。原因や動機がすべて分かっていない事件を、本人だけで「結論」にできるでしょうか。この相談室は、歴史の謎そのものを扱っているのです。","sg-2-24-022":"信長の家臣だった光秀は、本能寺の変（1582年）で信長を襲いました。その理由は今も諸説あり、単純な「上司が怖かったから」とは断定できません。相談相手が当事者本人というのも、なかなか難しい状況です。","sg-2-24-023":"信長は1560年の桶狭間の戦いや、1567年ごろからの「天下布武」などで勢力を広げました。大きな功績があった一方、家臣との関係が常に順調だったわけではありません。長所だけで相談を終えることはできません。","sg-2-24-024":"光秀は1582年に本能寺の変を起こし、信長を襲いました。いまなお動機が確定していないほど複雑な事件です。当事者同士の「相談室」が、ひと言で解決しないのも当然かもしれません。","sg-2-25-001":"秀吉は身分の低いところから出世し、1585年に関白、1590年には全国統一を進めました。戦国時代にここまで上りつめた人物は特別です。自慢したくなるほどの大出世ですが、その陰には数々の戦いや政治の駆け引きがありました。","sg-2-25-002":"信長の家臣だった秀吉は、後に1590年の全国統一を進めます。それでも元の主君の前では「聞かん」の一言。天下人となる前に、誰の下で働いていたかがよく分かる場面です。","sg-2-25-009":"「藤吉郎」は秀吉が若い頃に使った名前。信長に仕えた時代を知る人から呼ばれると、天下人になっても新人時代に引き戻された気分でしょう。","sg-2-25-023":"信長の家臣から出世した秀吉は、本能寺の変（1582年）後に勢力を伸ばし、1590年には全国統一を進めました。主君への恩と、自らつかんだ天下。その両方が秀吉の歴史にあります。","sg-2-25-025":"秀吉は1598年に亡くなり、家康は1603年に江戸幕府を開きました。天下をまとめた秀吉にも、自分の死後にどうなるかは分からなかったはず。未来の勝者に話を持っていかれるのは悔しいでしょう。","sg-2-28-001":"秀吉は「木下藤吉郎」「羽柴秀吉」「豊臣秀吉」など、時代によって呼び名が変わりました。単なる気分転換ではなく、名前から出世の歩みをたどれるのが面白いところです。","sg-2-28-004":"信長に仕えていた頃の秀吉は、藤吉郎と呼ばれていました。後に天下人となっても、この一声には反射で返事。上下関係の記憶は、地位が変わっても簡単には消えないようです。","sg-2-28-005":"「藤吉郎」は秀吉が若い頃に使った名前です。関白にまで出世しても、昔の上司には昔の名前で呼ばれてしまう。秀吉の大出世を知るほど、呼び捨ての一言が効いてきます。","sg-2-28-006":"秀吉は信長に仕えた若い頃、藤吉郎と呼ばれていました。後に1585年に関白になるほど出世しても、元上司の一声で反射的に返事。人間関係だけは一瞬で昔に戻ってしまいます。","sg-2-28-011":"信玄は1573年に亡くなり、秀吉が豊臣の姓を得る1586年よりずっと前の人物。羽柴という名に信玄の字は入っていませんが、自分も加わりたいと言い出すのが、このライバルたちのにぎやかさです。","sg-2-28-012":"「羽柴」は丹羽長秀と柴田勝家から一字ずつ取ったと伝わります。そこへ武田まで足したら名前が長すぎ！ 実際の由来にも伝承が含まれるので、確定した事実と分けて覚えましょう。","sg-2-28-013":"秀吉の呼び名は木下藤吉郎、羽柴秀吉、豊臣秀吉など。名前の変化は出世や政治上の立場と結びついています。「武田羽柴」という名前は実際の改名ではありません。","sg-2-28-018":"秀吉が豊臣姓を得たのは1586年。それでも信長にとっては昔から知る「藤吉郎」。天下人の肩書も、旧知の主君の前では通用しないようです。","sg-2-28-019":"秀吉は1586年に朝廷から豊臣の姓を与えられました。名前が変わるのは地位や権威とも結びつく重大な出来事。それなのに信長は昔の「藤吉郎」を使い続けています。","sg-2-28-021":"光秀の「三日天下」は1582年の本能寺の変と山崎の戦いに由来する呼び名です。名前を変えても、短い期間で権力を失った歴史までは変わりません。","sg-2-28-022":"秀吉が木下藤吉郎から羽柴秀吉、さらに豊臣姓へと変わったように、歴史人物には複数の呼び名があります。一方、光秀に残った「三日天下」は本人の希望で変えられない後世の評価。名前から時代の変化を読み取れます。","sg-3-34-010":"信長は本能寺の変（1582年）で亡くなり、全国統一は実現できませんでした。秀吉が1590年に全国統一を進めたのは、その後のこと。「殿の志を継いだ」という言葉に、信長の手が届かなかった続きが詰まっています。","sg-3-34-015":"秀吉は1590年に全国統一を進めましたが、1598年に亡くなります。その後、家康が1600年の関ヶ原の戦いを経て、1603年に江戸幕府を開きました。主役が交代するスピードの速さに注目です。","sg-3-34-017":"信長は1560年の桶狭間などで勢力を拡大、秀吉は1590年に全国統一を進め、家康は1603年に幕府を開きました。三人の時代をつなぐと、戦国の争いから江戸の長期支配へ向かう大きな流れが見えます。","sg-3-34-018":"信長が1582年までに進めた勢力拡大がなければ、秀吉の全国統一も同じ形にはならなかったでしょう。前の人が築いた土台を次の人が受け継ぐ――歴史は一人だけでは動きません。","sg-3-34-023":"1582年の本能寺の変で信長が亡くなると、織田家の後継争いが始まり、秀吉が台頭しました。その大事件を起こした光秀本人が、何食わぬ顔で「障害」と呼んでいるのだから、信長が怒るのも当然です。","sg-3-34-025":"信長は1582年の本能寺の変で亡くなりましたが、それまでに大きく勢力を伸ばしていました。全国統一は果たせなくても、秀吉や家康へつながる流れを作った重要人物です。","sg-3-34-026":"秀吉が1590年に全国統一を進めた後、1603年には家康が江戸幕府を開きます。努力して築いた天下を、次の人が長く治める仕組みにしたのですから、秀吉が納得しにくい気持ちも想像できます。","sg-3-38-002":"秀吉は1590年に全国統一を進めましたが、1598年に亡くなります。家康が江戸幕府を開いたのは1603年。秀吉には手に入れられなかった「約260年間続く政治」が、家康最大の自慢になっています。","sg-3-38-011":"光秀は1582年の本能寺の変後、約11日で山崎の戦いに敗れました。片や江戸幕府は1603〜1867年の約260年間。比べるには差が大きすぎて、光秀が怒るのも無理はありません。","sg-3-38-014":"家康が征夷大将軍だったのは1603〜1605年の約2年間。その後、秀忠へ将軍職を譲りました。江戸幕府が約260年続いたのは、家康一人が将軍を続けたからではないのです。","sg-3-38-016":"光秀は1582年、本能寺の変から約11日後に山崎で敗れました。家康は1605年に息子の秀忠へ将軍職を引き継いでいます。「後継者へ渡す」という段階まで進められたかどうかが、大きな違いです。","sg-3-38-019":"江戸幕府は1603〜1867年、約260年間続きました。大名を統制する制度や、次の将軍へ権力を引き継ぐ仕組みが重要だったのです。武将一人の強さと、政権が長持ちすることは別だと分かります。","sg-3-38-022":"秀吉が亡くなったのは1598年。その後、家康が1603年に江戸幕府を開きました。自分の後の時代を築いた家康を褒めるのは、秀吉にとって複雑なはずです。","sg-3-38-023":"光秀は1582年の本能寺の変で信長を倒しましたが、約11日後には山崎で敗れました。わずかな期間でも歴史を大きく変えた人物。短さだけでなく、その後に起きた変化にも目を向けたいところです。","sg-3-38-025":"光秀は1582年の本能寺の変から山崎の戦いまで約11日間で敗れました。歴史はやり直せませんが、その短い間に信長の死と秀吉の台頭という大転換が起こったのです。","sg-3-45-001":"信長なら本能寺の変（1582年）、秀吉なら太閤検地や刀狩、家康なら江戸幕府（1603年）。人物と出来事をセットで覚えると、戦国の流れが驚くほど整理できます。ただし、実際の検索ランキングを調べたものではありません。","sg-3-45-006":"信長が亡くなったのは1582年の本能寺の変。天下統一へ向かって勢力を広げていた途中の出来事です。大きな功績があっても、後世の人に最も強く記憶されるのが自分の最期だったら、複雑でしょう。","sg-3-45-009":"光秀の名前と一緒に語られがちなのは本能寺の変（1582年）と「三日天下」。歴史を変える事件を起こした一方、約11日で山崎に敗れました。短い期間に大きな出来事が詰まっています。","sg-3-45-014":"秀吉は若い頃「藤吉郎」と呼ばれ、やがて1585年に関白へと出世しました。「猿」という呼び名は逸話で知られますが、由来や実際の使われ方には注意が必要。天下人になっても昔のあだ名が残るとは、本人には不満でしょう。","sg-3-45-015":"秀吉の若い頃の名が「藤吉郎」。信長に仕えた時代の呼び名です。後の関白・豊臣秀吉も、信長から見れば昔の家臣。出世の前後で呼び方が変わらないのが面白いところです。","sg-3-45-017":"信玄と謙信を結びつけるのが川中島の戦い（1553〜1564年）。現在の長野県北部をめぐり、5回と数えられる戦いをしました。自分の名前を調べたらライバルまで出てくる――歴史から切り離せない二人です。","sg-3-45-020":"川中島の戦いは1553〜1564年に5回と数えられます。信玄と謙信は敵同士ですが、教科書では必ず一緒に語られる存在。互いを否定するほど、後世には強いコンビとして記憶されるのです。","sg-3-45-021":"信玄は謙信と川中島の戦い（1553〜1564年）で長年対立しました。5回と数えられる戦いが続いた二人にとって、「仲良し」とまとめられるのは我慢ならないはずです。","sg-3-45-022":"川中島の戦い（1553〜1564年）で対立した信玄と謙信が、今度は「仲良しじゃない」という意見で一致。5回も戦った相手だけあって、反応までそっくりです。","sg-3-45-023":"信玄と謙信は1553〜1564年に川中島で5回と数えられる戦いをしました。約12年も張り合った二人が、同じタイミングで同じ言葉。ライバルなのに息が合うのが不思議です。","sg-3-45-024":"家康は1603年に江戸幕府を開きました。関ヶ原の戦い（1600年）で勝利し、天下の実権を握った人物です。信玄と謙信の対立を見た後では、自分の実績を安心して披露できそうです。","sg-3-45-031":"本能寺の変（1582年）は、家臣の光秀が主君の信長を襲った事件。信長が亡くなったことで、天下の勢力関係が一気に動きました。こんな大事件を「驚かせた」で片付けてしまうと、光秀の立場はますます悪くなりそうです。","sg-3-48-003":"戦国時代の武将の判断は、国や家臣、農民の暮らしを大きく動かしました。勝った人の功績だけでなく、敗れた人や巻き込まれた人の立場から考えると、同じ出来事でも見え方が変わります。","sg-3-48-004":"秀吉は1590年に全国統一を進めましたが、死後、豊臣家の力は衰えていきました。勝ち続けたように見える人物にも、その先の課題が残っていたのです。","sg-3-48-009":"信長の本能寺の変（1582年）、秀吉の政策、家康の戦での失敗、信玄と謙信の争い。これほど大きな歴史を動かした人たちでも、反省となると簡単には言葉が出ません。","sg-3-48-010":"本能寺の変（1582年）で信長は光秀に襲われ、命を落としました。もし警備や家臣との関係が違っていたら――。歴史の「もしも」は考えられますが、実際に防げたかどうかは断定できません。","sg-3-48-012":"1582年の本能寺の変は、信長の家臣だった光秀が起こした事件です。信長の死によって全国統一の流れが変わり、秀吉らの争いにつながりました。信長にとって光秀は、ただの部下では済まない存在です。","sg-3-48-013":"光秀と信長の関係は、本能寺の変（1582年）で決定的に変わりました。かつての主君から和解の言葉が出たかと思ったら、すぐに突き放される。二人の歴史を知っていると、気まずさが増します。","sg-3-48-015":"本能寺の変（1582年）で信長が亡くなると、秀吉らが次の主導権を争いました。たった一つの事件が全国の勢力図を動かしたのです。光秀の行動が及ぼした影響は、約11日という短い期間よりもずっと大きいものでした。","sg-3-48-021":"1588年の刀狩は、農民などから武器を取り上げる政策でした。戦乱を抑える狙いがある一方、武器を取り上げられる人々には不安もあったはず。政治の「成果」と、暮らす人々への影響は両方考える必要があります。","sg-3-48-023":"家康は三方ヶ原の戦い（1572年）で信玄に大敗しました。後に1603年に江戸幕府を開く人物にも、若い頃には命を失いかねない失敗があったのです。失敗の先にどう立ち直ったかが重要です。","sg-3-48-024":"信玄は1572年の三方ヶ原の戦いで家康に勝っています。後に天下を取った家康にも勝った経験があるのだから、信玄にとっては自慢したい思い出でしょう。","sg-3-48-030":"川中島の戦い（1553〜1564年）で、信玄と謙信は約12年間に5回対立したとされます。反省を求められているのに、二人は「次こそ決着を」と意気込んでいます。歴史の教訓より勝負が先になっているようです。","sg-3-48-032":"川中島の戦いは1553〜1564年に5回と数えられています。現実に6回目の戦いがあったという意味ではありません。二人にとっては、約12年争ったライバルへの闘志がまだ消えていないのです。","sg-3-48-033":"戦国時代には、多くの武将が天下や領地をめぐって戦い、そのたびに家臣や農民の暮らしが揺さぶられました。目の前の勝ち負けだけでなく、何が変わったのかを見ることが歴史を学ぶ面白さです。","sg-3-48-035":"秀吉は信長の家臣から出世し、1590年に全国統一を進めました。普段は信長を持ち上げる秀吉も、ここでは「全員で決めましょう」と反対。戦国の上下関係が透けて見える一言です。","sg-3-48-038":"1582年の本能寺の変で、光秀は自分の主君だった信長を襲いました。そんな相手にグループの権限を任せるのは、信長にはどうしても無理でしょう。","sg-3-48-039":"戦国時代、誰が日本を動かすのかを大名たちが争いました。信長の勢力拡大、秀吉の全国統一、家康の幕府成立へと続く長い競争です。この部屋でも管理者が決まらないまま、まるで戦国時代が続いているようですね。"};
  function betterExplanation(m){
    if(m.editorialExplanation)return m.editorialExplanation;
    const curated=EDUCATIONAL_EXPLANATIONS[m.id];
    if(curated)return curated;
    // The original remains intact for non-curated lines. Strip only redundant
    // fourth-wall commentary when another substantial historical sentence remains.
    let pieces=(m.explanation||'').match(/[^。！？]+[。！？]?/g)||[];
    if(pieces.length<2)return m.explanation;
    const keep=pieces.filter((part,i)=>{
      if(!/創作|冗談|ネット風の|という笑い|というギャグ|実際の会話|本人の発言ではありません/.test(part))return true;
      if(/^(?:これは|ここでは|この会話は|死後の|現代の|本人が|実際の本人の発言は)/.test(part.trim())&&pieces.length>1)return false;
      // Do not discard historically informative sentences that also flag creative fiction.
      return true;
    });
    const candidate=keep.join('').trim();
    return candidate.length>=40?candidate:m.explanation;
  }
  // Temporary natural-paced screening: preserve every interval within each episode.
  // Only the 11 multi-hour gaps between episodes are shortened to 30 minutes.
  // A separate storage key prevents the old 3-second test from being resumed.
  // Switching enabled=false restores the original three-day shared schedule.
  const COMPACT_BROADCAST={enabled:true,episodeGapMs:30*60*1000,key:'sengoku-compact-start-20261107-30min-v1'};
  // Local-only test playback uses the device's clock, never a potentially cached
  // HTTP Date header. Migrate the existing device's progress once, without
  // restarting its 12-episode run or changing the shared schedule.
  const COMPACT_LOCAL_CLOCK_MIGRATED='sengoku-compact-local-clock-20261107-v1';
  let screeningStart=null;
  function migrateCompactClock(legacyOffset){
    if(!COMPACT_BROADCAST.enabled)return;
    try{
      if(localStorage.getItem(COMPACT_LOCAL_CLOCK_MIGRATED)==='1')return;
      const oldStart=Number(localStorage.getItem(COMPACT_BROADCAST.key));
      if(Number.isFinite(oldStart)&&oldStart>0){
        const finalOffset=Math.max(0,ordered.at(-1)?.offsetMs||0);
        // Preserve how far the viewer had progressed on the previous clock.
        // A misdated cached response must not leave all messages "yesterday"
        // or show future timestamps after this migration.
        const elapsed=Math.min(finalOffset+60000,Math.max(0,Date.now()+legacyOffset-oldStart));
        const fixedStart=Date.now()-elapsed;
        localStorage.setItem(COMPACT_BROADCAST.key,String(fixedStart));
        screeningStart=fixedStart;
      }
      localStorage.setItem(COMPACT_LOCAL_CLOCK_MIGRATED,'1');
    }catch(_){/* Private mode: the device clock is still the only source. */}
  }
  function rapidStart(){
    if(screeningStart!==null)return screeningStart;
    try{
      const stored=Number(localStorage.getItem(COMPACT_BROADCAST.key));
      if(Number.isFinite(stored)&&stored>0&&stored<=now()+60000&&stored>now()-30*DAY_MS)screeningStart=stored;
    }catch(_){/* private browsing */}
    if(screeningStart===null){
      screeningStart=now();
      try{localStorage.setItem(COMPACT_BROADCAST.key,String(screeningStart));}catch(_){}
    }
    return screeningStart;
  }
  let room=null,ordered=[],messageById=new Map(),settings={},checksum='';
  let currentKey='',drawnIds=[],rendered=[],drawnDay='',unreadIndex=-1,entryUnreadIndex=-1;
  let searchOpen=false,searchTerm='',selectedId=null,previousCycle=null;
  let serverOffsetMs=0,firstLoad=true,liveTypingId='',previewCount=0,previewTimer=null;
  let lastActiveKey='',lastUnreadBadge=-1,readingAnchorId=null;

  function close(){
    if(window.parent!==window){window.parent.postMessage({type:'sengoku-close'},location.origin)}
    else if(history.length>1)history.back();else location.href='index.html';
  }
  // Reuse the exact audio pathway of the parent Himiko chat (tap/open),
  // including the main app's volume and mute preferences.
  // Iframe clicks don't bubble to the parent, so forward the genuine click event.
  function originalChatSound(kind,event){
    try{
      const host=window.parent!==window&&window.parent.location.origin===location.origin?window.parent:null;
      if(typeof host?.appSound==='function')host.appSound(kind,event);
    }catch(_){/* standalone and cross-origin embeds stay silent */}
  }
  document.addEventListener('click',event=>{
    const control=event.target.closest('button, .sengoku-member-card');
    if(!control||control.disabled)return;
    originalChatSound(control.classList.contains('sengoku-member-card')?'open':'tap',event);
  },true);
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest('#group-search-input'))originalChatSound('tap',event);
  },{passive:true});
  $('back').addEventListener('click',close);
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==='sengoku-theme')document.documentElement.dataset.persona=event.data.persona==='cyber'?'cyber':'neko';
  });
  // The synchronous <head> boot script already selected the parent persona before paint.
  // Never overwrite it with a stale iframe-local theme after CSS has loaded.
  if(!['cyber','neko'].includes(document.documentElement.dataset.persona)){
    try{document.documentElement.dataset.persona=localStorage.getItem('nekopon-character-theme-v1')==='cyber'?'cyber':'neko'}catch(_){document.documentElement.dataset.persona='neko';}
  }

  function safeLocalImage(url){return typeof url==='string'&&/^history-icons\/[A-Za-z0-9_.-]+\.(webp|png|jpg|jpeg)$/.test(url)?url:null;}
  function imageInto(url,container){
    container.replaceChildren();const src=safeLocalImage(url);
    if(src){const img=document.createElement('img');img.alt='';img.src=src;img.onerror=()=>img.remove();container.append(img);}
  }
  function jstKey(ms){return new Date(ms+JST_MS).toISOString().slice(0,10);}
  function dateLabel(ms){
    const day=jstKey(ms),today=jstKey(Date.now()+serverOffsetMs);
    if(day===today)return '今日';
    if(day===jstKey(Date.now()+serverOffsetMs-DAY_MS))return '昨日';
    return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(ms));
  }
  function clock(ms){return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);}
  function now(){return Date.now()+serverOffsetMs;}
  // Display label only. Speaker IDs, timeline keys, and the original v2 JSON stay unchanged.
  function displaySpeakerName(id,name){return id==='modern_student'?'受験生':name;}
  function mergeScript(script,config){
    if(!core?.parseMessages)throw Error('配信エンジンがありません');
    if(!script?.presentation||!Array.isArray(script.systemEvents)||!Array.isArray(script.timelineOrder))throw Error('台本第2稿ではありません');
    const messages=core.parseMessages(script).map(m=>{
      const update=STUDENT_STORY_REVISIONS[m.id];
      return {...m,
        name:displaySpeakerName(m.senderId,m.name),
        ...(update?{text:update.text,editorialExplanation:update.note}:{}),
      };
    });
    if(messages.length!==328||script.systemEvents.length!==8||script.timelineOrder.length!==336)throw Error('第2稿の件数が不一致です');
    const people=new Map(script.speakerCatalog.map(p=>[p.speakerId,p]));
    const byId=new Map(messages.map(m=>[m.id,{...m,kind:'message'}]));
    const episodes=new Set(script.episodes.map(e=>e.episodeId));
    for(const event of script.systemEvents){
      if(!event||byId.has(event.id)||!['join','leave','invite'].includes(event.event)||!people.has(event.subjectId)||!episodes.has(event.episodeId))throw Error('参加イベントが不正です');
      const day=/^Day ([1-3])$/.exec(event.day||''),sec=core.seconds(event.time);
      if(!day||sec===null)throw Error('イベント日時が不正です');
      byId.set(event.id,{...event,kind:'system',dayNumber:Number(day[1]),offsetMs:(Number(day[1])-1)*DAY_MS+sec*1000});
    }
    const seen=new Set(),entries=[];
    for(const pointer of script.timelineOrder){
      const value=byId.get(pointer?.id);
      if(!value||seen.has(pointer.id)||value.kind!==pointer.kind)throw Error('時系列の参照が不正です');
      seen.add(pointer.id);entries.push(value);
    }
    if(entries.length!==byId.size)throw Error('時系列の項目が不足しています');
    for(let i=1;i<entries.length;i++)if(entries[i].offsetMs<entries[i-1].offsetMs)throw Error('時系列が逆転しています');
    // Validate the original timeline before altering playback offsets. The on-screen
    // texts, IDs, read plans, system events and JSON remain exactly as authored.
    if(COMPACT_BROADCAST.enabled){
      let compactOffset=0;
      entries.forEach((entry,index)=>{
        const originalOffset=entry.offsetMs;
        if(index){
          const previous=entries[index-1];
          const originalGap=Math.max(0,originalOffset-previous.originalOffsetMs);
          const nextGap=entry.episodeId!==previous.episodeId
            ?Math.min(originalGap,COMPACT_BROADCAST.episodeGapMs)
            :originalGap;
          compactOffset+=nextGap;
        }
        entry.originalOffsetMs=originalOffset;
        entry.offsetMs=compactOffset;
      });
    }
    const initial=script.presentation.initialActiveSpeakerIds;
    if(!Array.isArray(initial)||!initial.length||initial.some(id=>!people.has(id)))throw Error('初期メンバーが不正です');
    if(config.startDate!==null&&core.startTime(config.startDate)===null)throw Error('開始日が不正です');
    const participants=script.speakerCatalog.map(p=>({
      id:p.speakerId,name:displaySpeakerName(p.speakerId,p.speakerName),role:p.speakerType,
      avatar:config.participants?.[p.speakerId]?.avatar||'',appCharacterId:config.participants?.[p.speakerId]?.appCharacterId??null
    }));
    return {script,config,people:new Map(participants.map(p=>[p.id,p])),participants,entries,messages,
      startDate:config.startDate,repeat:config.repeat!==false,title:script.title||'戦国の反省会',
      image:config.image||'',label:config.label||'期間限定',initial};
  }
  function phase(){
    if(!room)return null;
    const start=COMPACT_BROADCAST.enabled?rapidStart():core.startTime(room.startDate);
    if(start===null)return {status:'unconfigured',cycle:0,start:null,visible:[],time:0};
    if(preview){const visible=ordered.slice(0,previewCount);return {status:'preview',cycle:0,start,visible,time:visible.at(-1)?.offsetMs??0};}
    if(COMPACT_BROADCAST.enabled){
      const elapsed=Math.max(0,now()-start);
      const visible=ordered.filter(entry=>entry.offsetMs<=elapsed);
      const done=elapsed>=(ordered.at(-1)?.offsetMs??0)+COMPACT_BROADCAST.episodeGapMs;
      return {status:done?'finished':'running',cycle:0,start,visible,time:elapsed};
    }
    const elapsed=now()-start;
    if(elapsed<0)return {status:'waiting',cycle:0,start,visible:[],time:elapsed};
    const duration=3*DAY_MS;
    if(!room.repeat&&elapsed>=duration)return {status:'finished',cycle:0,start,visible:ordered,time:duration};
    const cycle=room.repeat?Math.floor(elapsed/duration):0;
    const cycleStart=start+cycle*duration;
    const time=now()-cycleStart;
    return {status:'running',cycle,start:cycleStart,visible:ordered.filter(x=>x.offsetMs<=time),time};
  }
  function activeAt(offset){
    const ids=new Set(room?.initial||[]);
    for(const e of ordered){
      if(e.offsetMs>offset)break;
      if(e.kind!=='system')continue;
      if(e.event==='join')ids.add(e.subjectId);
      else if(e.event==='leave')ids.delete(e.subjectId);
    }
    return ids;
  }
  // Use exactly the original Himiko presence function. Never invent an online state.
  // The five mapped IDs come from sengoku-chat/config.json; unmapped cast gets no badge.
  function hostWindow(){
    try{return window.parent!==window&&window.parent.location.origin===location.origin?window.parent:null;}
    catch(_){return null;}
  }
  function personalPresence(person){
    const host=hostWindow(),id=person?.appCharacterId;
    if(!Number.isInteger(id)||typeof host?.himikoPersonPresence!=='function')return null;
    try{
      const result=host.himikoPersonPresence({id,name:person.name});
      if(!result||!['オンライン','離席中','あとで戻る'].includes(result.label))return null;
      return result;
    }catch(_){return null;}
  }
  function profileAvailable(person){return Number.isInteger(person?.appCharacterId)&&!!hostWindow()?.document?.getElementById('card-list');}
  function openOriginalProfile(person){
    if(!profileAvailable(person))return;
    const host=hostWindow(),list=host.document.getElementById('card-list');
    // Hand the click to the EXISTING avatar->showProfile handler in Himiko.
    // This lets Himiko's lexical allHistoryChars/profile data remain the single
    // source of truth, without copying profiles or modifying the main app.
    const probe=host.document.createElement('button');
    probe.type='button';probe.className='char-card';
    probe.setAttribute('onclick','openChat('+person.appCharacterId+')');
    probe.tabIndex=-1;probe.setAttribute('aria-hidden','true');
    probe.style.cssText='position:absolute!important;left:-99999px!important;top:-99999px!important;visibility:hidden!important';
    const avatar=host.document.createElement('span');avatar.className='avatar';probe.append(avatar);
    list.append(probe);
    try{avatar.dispatchEvent(new host.MouseEvent('click',{bubbles:true,cancelable:true}));}
    finally{probe.remove();}
  }
  function appendMemberCard(list,person){
    const hasProfile=profileAvailable(person);
    const card=document.createElement(hasProfile?'button':'div');
    if(hasProfile){card.type='button';card.addEventListener('click',()=>openOriginalProfile(person));}
    card.className='char-card member-card sengoku-member-card';
    card.dataset.sengokuSpeakerId=person.id;
    if(hasProfile)card.setAttribute('aria-label',person.name+'のプロフィールを開く');
    else card.classList.add('sengoku-member-static');
    const content=document.createElement('span');content.className='card-inner';
    const avatar=document.createElement('span');avatar.className='avatar';
    imageInto(person.avatar,avatar);if(!avatar.childElementCount)avatar.textContent='👤';
    const info=document.createElement('span');info.className='card-info';
    const nameLine=document.createElement('span');nameLine.className='member-name-row';
    const name=document.createElement('span');name.className='member-name';name.textContent=person.name;
    nameLine.append(name);
    const state=personalPresence(person);
    if(state){
      const badge=document.createElement('span');badge.className='online-badge member-presence';
      badge.textContent=state.label;badge.style.color=state.color;badge.style.background=state.color+'20';
      nameLine.append(badge);
    }
    info.append(nameLine);
    if(person.role!=='modern'){
      const period=periodBySender[person.id];
      if(period){const sub=document.createElement('span');sub.className='member-period';sub.textContent='（'+period+'）';info.append(sub);}
    }
    content.append(avatar,info);card.append(content);list.append(card);
  }
  function refreshMemberPresence(){
    if(!room||$('group-members').hidden)return;
    for(const card of $('group-member-list').querySelectorAll('[data-sengoku-speaker-id]')){
      const person=room.people.get(card.dataset.sengokuSpeakerId);
      const state=personalPresence(person);let badge=card.querySelector('.member-presence');
      if(!state){badge?.remove();continue;}
      if(!badge){badge=document.createElement('span');badge.className='online-badge member-presence';card.querySelector('.member-name-row')?.append(badge);}
      if(badge.textContent!==state.label||badge.style.color!==state.color){
        badge.textContent=state.label;badge.style.color=state.color;badge.style.background=state.color+'20';
      }
    }
  }
  function updatePeople(state){
    if(!state)return;
    const active=activeAt(state.time),names=[...active].join('|');
    const key=state.cycle+'|'+names+'|'+room.title;
    if(key===lastActiveKey){refreshMemberPresence();return;}
    lastActiveKey=key;
    const label=room.title+' ('+active.size+')';
    $('group-title').textContent=label;
    $('sengoku-period-badge').textContent=room.label;
    document.querySelector('.members-title').textContent=label;
    const list=$('group-member-list');list.replaceChildren();
    const missing=room.participants.filter(p=>!active.has(p.id));
    const joined=room.participants.filter(p=>active.has(p.id));
    const section=(icon,count,text)=>{
      const heading=document.createElement('h3');heading.className='membership-section-title';
      const emoji=document.createElement('span');emoji.setAttribute('aria-hidden','true');emoji.textContent=icon;
      heading.append(emoji,' '+count+'人が'+text+'です');list.append(heading);
    };
    section('🚪',missing.length,'退会中');
    for(const p of missing)appendMemberCard(list,p);
    section('👋',joined.length,'参加中');
    for(const p of joined)appendMemberCard(list,p);
    imageInto(room.image,$('group-header-avatar'));
    imageInto(room.image,document.querySelector('.group-members-avatar'));
    publishRoomTitle(label);
  }

  function storageKey(cycle){return (COMPACT_BROADCAST.enabled?'sengoku-compact-last-read-30min-v1:':'sengoku-last-read-v2:')+room.startDate+':'+cycle;}
  function getReadIndex(state){
    if(preview||!state)return -1;
    let key='';try{key=localStorage.getItem(storageKey(state.cycle))||'';}catch(_){/* private mode */}
    if(!key)return -1;
    // Identify the exact message in this *cycle*, not a reused ID in a future cycle.
    return state.visible.findIndex(x=>x.id===key);
  }
  function setReadIndex(state,n){
    if(preview||!state||n<0||n<=unreadIndex||n>=state.visible.length)return;
    unreadIndex=n;
    try{localStorage.setItem(storageKey(state.cycle),state.visible[n].id);}catch(_){/* private mode */}
    updateUnread(state);
  }
  function parentDocument(){
    try{return window.parent!==window&&window.parent.location.origin===location.origin
      ?window.parent.document:null;}
    catch(_){return null;}
  }
  function parentEntry(){return parentDocument()?.querySelector('.sengoku-chat-entry')||null;}
  function isRoomVisible(){
    const panel=parentDocument()?.getElementById('sengoku-panel');
    return !panel||!panel.hidden;
  }
  function publishRoomTitle(title){
    const entry=parentEntry();if(!entry)return;
    const label=entry.querySelector('.sengoku-entry-title');
    if(label&&label.textContent!==title)label.textContent=title;
  }
  // Exactly the same corner badge geometry as Himiko's #group-unread.
  // The parent app's #group-unread CSS is ID-scoped, so apply its values to
  // the read-only Sengoku card without editing the much larger himiko.html.
  function ensureUnreadBadgeStyle(doc){
    if(doc.getElementById('sengoku-original-unread-badge-style'))return;
    const style=doc.createElement('style');
    style.id='sengoku-original-unread-badge-style';
    style.textContent=`
      #list-view .sengoku-chat-entry .sengoku-unread-badge{
        position:absolute;top:-3px;right:-2px;z-index:2;box-sizing:border-box;
        display:inline-flex;align-items:center;justify-content:center;
        min-width:22px;height:22px;padding:0 5px;border-radius:12px;
        font-family:inherit;font-size:12px;font-weight:700;line-height:1;
        background:#e05e62;color:#fff;pointer-events:none;
        box-shadow:0 0 0 2px #fff8f0;
      }
      html[data-persona="cyber"] #list-view .sengoku-chat-entry .sengoku-unread-badge{
        box-shadow:0 0 0 2px #101b32;
      }
      #list-view .sengoku-chat-entry .sengoku-unread-badge[hidden]{display:none!important}
    `;
    doc.head.append(style);
  }
  function publishUnread(count){
    count=Math.max(0,Number(count)||0);
    const entry=parentEntry();
    if(entry){
      const doc=entry.ownerDocument;
      let badge=entry.querySelector('.sengoku-unread-badge');
      if(count===0){badge?.remove();}
      else{
        ensureUnreadBadgeStyle(doc);
        if(!badge){
          badge=doc.createElement('span');
          badge.className='group-unread sengoku-unread-badge';
        }
        // Same placement as the main app's badge: a direct child of the card,
        // after .card-inner. NEVER put it beside the title or limited label.
        badge.removeAttribute('style');
        badge.classList.add('group-unread');
        if(badge.parentElement!==entry || badge!==entry.lastElementChild)entry.append(badge);
        badge.hidden=false;
        badge.textContent=count>99?'99+':String(count);
      }
    }
    if(lastUnreadBadge===count)return;
    lastUnreadBadge=count;
    if(window.parent!==window){try{window.parent.postMessage({type:'sengoku-unread',count},location.origin);}catch(_){/* opaque local test origin */}}
  }
  function updateUnread(state){
    if(!state||preview)return;
    const next=Math.min(unreadIndex+1,state.visible.length);
    publishUnread(Math.max(0,state.visible.length-next));
    if(searchTerm)return;
    const existing=inner.querySelector('.sengoku-unread-divider');
    // This marks the messages unread on ENTRY. It does not jump forward or flicker
    // while the user reads, exactly like the original group's entry divider.
    const target=entryUnreadIndex>=0?inner.querySelector(`[data-timeline-index="${entryUnreadIndex}"]`):null;
    if(!target){existing?.remove();return;}
    if(existing&&existing.nextSibling===target)return;
    existing?.remove();
    const divider=document.createElement('div');
    divider.className='sengoku-unread-divider';divider.setAttribute('role','separator');
    divider.setAttribute('aria-label','ここから未読メッセージ');
    divider.textContent='ここから未読メッセージ';
    inner.insertBefore(divider,target);
  }
  function updateReadFromViewport(){
    if(document.hidden||!isRoomVisible()||preview||searchTerm||!room)return;
    const state=phase();if(!state||state.cycle!==previousCycle)return;
    const bounds=box.getBoundingClientRect();let max=unreadIndex;
    // Mark only rows actually visible at the bottom of the reader's viewport.
    for(const elem of inner.querySelectorAll('[data-timeline-index]')){
      const rect=elem.getBoundingClientRect();if(rect.top>=bounds.bottom-8)break;
      if(rect.bottom<=bounds.top+10)continue;
      max=Math.max(max,Number(elem.dataset.timelineIndex));
    }
    if(max>unreadIndex)setReadIndex(state,max);
  }
  function readCount(message,state){
    if(message.role!=='modern'||!Array.isArray(message.readPlan)||!state)return 0;
    const elapsed=(preview?state.time:now()-state.start)-message.offsetMs;
    let count=0;
    for(const step of message.readPlan){
      if(!Number.isFinite(step.afterSeconds)||!Number.isFinite(step.count)||elapsed<step.afterSeconds*1000)continue;
      const members=activeAt(message.offsetMs+step.afterSeconds*1000).size;
      count=Math.max(count,Math.min(Math.max(0,step.count),Math.max(0,members-1)));
    }
    return count;
  }
  function timeNode(m,state){
    const el=document.createElement('span');el.className='history-message-time sengoku-time';
    el.dataset.readMessageId=m.id;
    const count=readCount(m,state);
    el.textContent=(count?'既読 '+count+'\n':'')+clock(state.start+m.offsetMs);
    return el;
  }
  function paintSelectedBubble(){
    for(const bubble of inner.querySelectorAll('.sengoku-bubble[aria-pressed="true"]')){
      bubble.classList.remove('sengoku-bubble-selected');bubble.setAttribute('aria-pressed','false');
    }
    if(selectedId){
      const row=[...inner.querySelectorAll('[data-message-id]')].find(el=>el.dataset.messageId===selectedId);
      const bubble=row?.querySelector('.sengoku-bubble');
      if(bubble){bubble.classList.add('sengoku-bubble-selected');bubble.setAttribute('aria-pressed','true');}
    }
    // The explanation tray uses the same accent, linking it to the selected bubble.
    explanation.classList.toggle('has-selected-bubble',!!selectedId);
    // SVG shapes are recalculated when color changes, with no list repaint.
    window.dispatchEvent(new Event('sengoku-bubble-selection'));
  }
  function selectExplanation(message){
    // Second tap on the same bubble clears the explanation and its highlight.
    const wasSelected=selectedId===message.id;
    selectedId=wasSelected?null:message.id;
    explanationText.textContent=wasSelected?'':betterExplanation(message);
    explanation.scrollTop=0;
    paintSelectedBubble();
  }
  function messageRow(m,state){
    const modern=m.role==='modern';
    const row=document.createElement('div');row.className='bubble-row '+(modern?'user':'assistant');row.dataset.messageId=m.id;
    if(!modern){
      const person=room.people.get(m.senderId),canOpen=profileAvailable(person);
      const icon=document.createElement(canOpen?'button':'span');
      if(canOpen){icon.type='button';icon.classList.add('sengoku-profile-button');icon.setAttribute('aria-label',m.name+'のプロフィールを開く');icon.addEventListener('click',()=>openOriginalProfile(person));}
      icon.classList.add('bubble-avatar');
      imageInto(person?.avatar,icon);
      if(!icon.childElementCount)icon.textContent='👤';row.append(icon);
    }
    const bubble=document.createElement('button');bubble.type='button';bubble.className='bubble sengoku-bubble '+(modern?'user':'assistant');
    bubble.setAttribute('aria-pressed',m.id===selectedId?'true':'false');
    if(m.id===selectedId)bubble.classList.add('sengoku-bubble-selected');
    bubble.textContent=m.text;bubble.setAttribute('aria-label',m.name+'の発言、タップで解説を表示または閉じる');
    bubble.addEventListener('click',()=>selectExplanation(m));
    const at=timeNode(m,state);
    if(modern)row.append(bubble,at);
    else{
      const content=document.createElement('div');content.className='group-reply-content';
      const name=document.createElement('div');name.className='group-reply-name';
      const person=room.people.get(m.senderId),canOpen=profileAvailable(person);
      // Preserve Himiko's ORIGINAL span.group-name-label wrapper: it provides
      // the intrinsic width while the parent grid's name line intentionally has width:0.
      const wrapper=document.createElement('span');wrapper.className='group-name-label';
      const label=document.createElement(canOpen?'button':'span');label.textContent=m.name;
      if(canOpen){label.type='button';label.className='sengoku-name-profile';label.setAttribute('aria-label',m.name+'のプロフィールを開く');label.addEventListener('click',()=>openOriginalProfile(person));}
      wrapper.append(label);
      const period=periodBySender[m.senderId];if(period){
        const sub=document.createElement('span');sub.className='group-reply-period';sub.textContent=`（${period}）`;wrapper.append(' ',sub);
      }
      name.append(wrapper);content.append(name,bubble,at);row.append(content);
    }
    return row;
  }
  function systemRow(e,state){
    const row=document.createElement('div');row.className='group-system-event sengoku-system-event';
    const capsule=document.createElement('span');
    const time=document.createElement('time');time.textContent=clock(state.start+e.offsetMs);
    time.setAttribute('datetime',new Date(state.start+e.offsetMs).toISOString());
    const label=document.createElement('span');label.className='group-event-label';label.textContent=e.text;
    capsule.append(time,label);row.append(capsule);return row;
  }
  function addRow(e,state,index){
    const actual=state.start+e.offsetMs;
    const day=jstKey(actual);
    if(day!==drawnDay){
      const head=document.createElement('div');head.className='history-day sengoku-date';head.dataset.date=day;
      const label=document.createElement('span');label.textContent=dateLabel(actual);head.append(label);
      inner.append(head);drawnDay=day;
    }
    const node=e.kind==='system'?systemRow(e,state):messageRow(e,state);
    node.dataset.timelineIndex=String(index);node.dataset.timelineId=e.id;
    inner.append(node);drawnIds.push(e.id);rendered.push(e);
  }
  function showEmpty(state){
    const p=document.createElement('p');p.id='sengoku-empty';p.textContent=searchTerm?'該当する会話はありません':
      state.status==='unconfigured'?'配信開始日は設定されていません':
      state.status==='waiting'?'配信開始までお待ちください':
      state.status==='preview'?'再生ボタンで会話を確認できます':'新しい会話を待っています';
    inner.append(p);
  }
  function resetRows(){inner.replaceChildren();drawnIds=[];rendered=[];drawnDay='';liveTypingId='';}
  function updateTimes(state){
    for(const e of rendered){
      if(e.kind!=='message'||e.role!=='modern')continue;
      const time=inner.querySelector(`[data-read-message-id="${e.id}"]`);if(!time)continue;
      const count=readCount(e,state),txt=(count?'既読 '+count+'\n':'')+clock(state.start+e.offsetMs);
      if(time.textContent!==txt)time.textContent=txt;
    }
    for(const head of inner.querySelectorAll('.sengoku-date')){
      const ms=core.startTime(head.dataset.date);
      const val=ms===null?'':dateLabel(ms);
      const span=head.querySelector('span');
      if(val&&span&&span.textContent!==val)span.textContent=val;
    }
  }
  function updateTyping(state){
    const existing=$('sengoku-live-typing');
    if(!state||preview||searchTerm||!['running'].includes(state.status)){
      existing?.remove();liveTypingId='';return;
    }
    // Show dots only for the *next scheduled timeline item*.
    // Looking ahead past a student message or a system event made dots appear
    // above subsequently appended bubbles while the historical speaker waited.
    const next=ordered.find(e=>e.offsetMs>state.time);
    const lead=Number(next?.typingLeadSeconds)||0;
    const target=next?.kind==='message'&&next.role==='historical'
      &&lead>0&&next.offsetMs-state.time<=lead*1000 ? next : null;
    if(!target){existing?.remove();liveTypingId='';return;}
    if(existing&&liveTypingId===target.id){
      // A newly received bubble or event may have been appended after the dots.
      // Keep typing at the very bottom until the incoming bubble replaces it.
      if(existing!==inner.lastElementChild)inner.append(existing);
      return;
    }
    existing?.remove();liveTypingId=target.id;
    // Mirrors Himiko's groupTyping(): the sender name/period is never squeezed
    // into the 0-width name grid while the bubble is still being prepared.
    const row=document.createElement('div');row.id='sengoku-live-typing';
    row.className='bubble-row assistant typing-row sengoku-live-typing';
    row.setAttribute('role','status');row.setAttribute('aria-label',target.name+'が入力中');
    const spacer=document.createElement('div');spacer.className='bubble-avatar-spacer';spacer.setAttribute('aria-hidden','true');
    const typing=document.createElement('div');typing.className='typing';
    for(let i=0;i<3;i++){
      const dot=document.createElement('span');dot.className='typing-dot';
      dot.style.background='#6b90a8';dot.style.animationDelay=(i*.2)+'s';typing.append(dot);
    }
    row.append(spacer,typing);inner.append(row);
  }
  function render(){
    const state=phase();if(!state)return;
    updatePeople(state);
    const view=searchTerm?state.visible.filter(e=>e.kind==='message'&&(e.text+' '+e.name+' '+betterExplanation(e)).toLocaleLowerCase().includes(searchTerm)):state.visible;
    if(searchTerm&&selectedId&&!view.some(e=>e.id===selectedId)){
      selectedId=null;explanationText.textContent='';explanation.classList.remove('has-selected-bubble');
    }
    const key=String(state.cycle)+'|'+state.status+'|'+searchTerm+'|'+state.start;
    const same=key===currentKey,append=same&&drawnIds.length<=view.length&&drawnIds.every((id,i)=>id===view[i].id);
    if(state.cycle!==previousCycle){
      previousCycle=state.cycle;
      unreadIndex=getReadIndex(state);
      entryUnreadIndex=state.visible.length>unreadIndex+1 ? unreadIndex+1 : -1;
      firstLoad=true;selectedId=null;explanationText.textContent='';explanation.classList.remove('has-selected-bubble');
    }
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<115;
    const previousTop=box.scrollTop;
    let changed=false;
    if(!append){resetRows();currentKey=key;changed=true;}
    if(view.length)$('sengoku-empty')?.remove();
    if(view.length){
      for(let i=drawnIds.length;i<view.length;i++){
        const idx=state.visible.findIndex(x=>x.id===view[i].id);
        addRow(view[i],state,idx);changed=true;
      }
    }else if(!drawnIds.length&&!$('sengoku-empty')){showEmpty(state);}
    updateTimes(state);
    updateUnread(state);
    updateTyping(state);
    if(changed&&selectedId)paintSelectedBubble();
    if(changed){
      requestAnimationFrame(()=>{
        if(firstLoad&&!preview&&!searchTerm&&state.visible.length&&unreadIndex<state.visible.length-1){
          const firstUnread=inner.querySelector(`[data-timeline-index="${entryUnreadIndex}"]`);
          if(firstUnread)box.scrollTop=Math.max(0,firstUnread.offsetTop-box.offsetTop-45);
          firstLoad=false;
        }else if(nearBottom&&!searchTerm){box.scrollTop=box.scrollHeight;firstLoad=false;}
        else{box.scrollTop=previousTop;firstLoad=false;}
        if(!preview)updateReadFromViewport();
      });
    }
  }
  // Same transient floating date used by Himiko's group: follows the scroll position.
  const floating=document.createElement('div');floating.className='history-floating';floating.setAttribute('aria-hidden','true');
  const floatingLabel=document.createElement('span');floating.append(floatingLabel);
  box.prepend(floating);
  let floatingTimer,scrollTouch=false,scrollUntil=0;
  box.addEventListener('pointerdown',()=>{scrollTouch=true;},{passive:true});
  for(const event of ['pointerup','pointercancel','pointerleave'])box.addEventListener(event,()=>{scrollTouch=false;scrollUntil=Date.now()+1400;},{passive:true});
  box.addEventListener('wheel',()=>{scrollUntil=Date.now()+1400;},{passive:true});
  box.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key))scrollUntil=Date.now()+1400;});
  box.addEventListener('scroll',()=>{
    if(!scrollTouch&&Date.now()>scrollUntil)return;
    scrollUntil=Date.now()+1400;
    const edge=box.getBoundingClientRect().top+3;
    const dates=[...inner.querySelectorAll('.history-day')];
    const active=dates.filter(d=>d.getBoundingClientRect().bottom<edge).at(-1);
    if(active){floatingLabel.textContent=active.textContent;floating.classList.add('is-visible');}
    else floating.classList.remove('is-visible');
    clearTimeout(floatingTimer);floatingTimer=setTimeout(()=>floating.classList.remove('is-visible'),1400);
  },{passive:true});

  // Mark visible rows as read without triggering an entire chat repaint or scroll jump.
  let scrollPending=false;
  box.addEventListener('scroll',()=>{
    if(scrollPending)return;scrollPending=true;
    requestAnimationFrame(()=>{scrollPending=false;updateReadFromViewport();});
  },{passive:true});

  $('group-members-direct').addEventListener('click',()=>{$('group-members').hidden=false;document.documentElement.dataset.membersOpen='true';refreshMemberPresence();});
  $('group-members-back').addEventListener('click',()=>{$('group-members').hidden=true;delete document.documentElement.dataset.membersOpen;});
  setInterval(refreshMemberPresence,5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshMemberPresence();});
  function search(open){
    searchOpen=open;$('group-search-form').hidden=!open;
    $('group-view').toggleAttribute('data-search-open',open);
    $('group-search-toggle').setAttribute('aria-expanded',String(open));
    if(open)$('group-search-input').focus();
    else{$('group-search-input').value='';searchTerm='';render();}
  }
  $('group-search-toggle').addEventListener('click',()=>search(!searchOpen));
  $('group-search-close').addEventListener('click',()=>search(false));
  $('group-search-clear').addEventListener('click',()=>{$('group-search-input').value='';searchTerm='';render();$('group-search-input').focus();});
  $('group-search-input').addEventListener('input',()=>{
    searchTerm=$('group-search-input').value.trim().toLocaleLowerCase();
    $('group-search-clear').hidden=!searchTerm;render();
  });
  $('group-search-form').addEventListener('submit',e=>{e.preventDefault();$('group-search-input').blur();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&searchOpen)search(false);});

  function previewStop(){if(previewTimer){clearInterval(previewTimer);previewTimer=null;}previewLabel();}
  function previewLabel(){if(!preview)return;
    $('sengoku-preview-progress').textContent=previewCount+' / '+ordered.length;
    $('sengoku-preview-play').textContent=previewTimer?'一時停止':'▶ 自動再生';
  }
  function previewSet(n){previewStop();previewCount=Math.max(0,Math.min(ordered.length,n));render();previewLabel();}
  function previewPlay(){
    if(previewTimer){previewStop();return;}
    if(previewCount>=ordered.length)previewCount=0;
    previewTimer=setInterval(()=>{previewCount=Math.min(ordered.length,previewCount+1);render();previewLabel();if(previewCount>=ordered.length)previewStop();},700);
    render();previewLabel();
  }
  if(preview){
    $('sengoku-preview-controls').hidden=false;
    $('sengoku-preview-play').addEventListener('click',previewPlay);
    $('sengoku-preview-next').addEventListener('click',()=>previewSet(previewCount+1));
    $('sengoku-preview-reset').addEventListener('click',()=>previewSet(0));
    $('sengoku-preview-all').addEventListener('click',()=>previewSet(ordered.length));
    for(let day=1;day<=3;day++)$('sengoku-preview-day'+day).addEventListener('click',()=>previewSet(ordered.filter(e=>e.dayNumber<=day).length));
    window.addEventListener('pagehide',previewStop);
  }
  $('sengoku-preview-all').textContent='全336件';

  async function load(){
    try{
      // IMPORTANT: root schedule.json is the latest v2. Keep sengoku-chat/schedule.json untouched (old v1 fallback).
      const [response,settingsResponse]=await Promise.all([
        fetch('schedule.json',{cache:'no-store'}),
        fetch('sengoku-chat/config.json',{cache:'no-store'})
      ]);
      if(!response.ok||!settingsResponse.ok)throw Error('配信データを取得できません');
      const fetchedAt=Date.now(),serverDate=response.headers.get('Date');
      const age=Math.max(0,Number(response.headers.get('Age'))||0);
      let legacyOffset=0;
      if(serverDate){const serverMs=Date.parse(serverDate);
        if(Number.isFinite(serverMs)&&Math.abs(serverMs+age*1000-fetchedAt)<3*DAY_MS)legacyOffset=serverMs+age*1000-fetchedAt;
      }
      // Keep the original three-day shared broadcaster's server-time handling.
      // The temporary per-device 30-minute-gap broadcaster must use local time.
      serverOffsetMs=COMPACT_BROADCAST.enabled?0:legacyOffset;
      const [data,config]=await Promise.all([response.json(),settingsResponse.json()]);
      const nextChecksum=JSON.stringify(data)+'|'+JSON.stringify(config);
      if(nextChecksum!==checksum){
        const next=mergeScript(data,config);
        room=next;settings=config;ordered=next.entries;
        messageById=new Map(next.messages.map(m=>[m.id,m]));checksum=nextChecksum;
        resetRows();currentKey='';lastActiveKey='';previousCycle=null;lastUnreadBadge=-1;
        if(preview){previewCount=Math.min(previewCount,ordered.length);previewLabel();}
        if(selectedId){const saved=messageById.get(selectedId);if(saved)selectExplanation(saved);}
      }
      // Do this only after the ordered timeline has been loaded; the final
      // scheduled offset determines whether an old session had already ended.
      if(COMPACT_BROADCAST.enabled)migrateCompactClock(legacyOffset);
      render();
    }catch(error){
      console.error('Sengoku room v2:',error);
      if(!checksum){resetRows();const p=document.createElement('p');p.id='sengoku-empty';p.textContent='会話の読み込みに失敗しました';inner.append(p);}
    }
  }
  load();
  // The original Himiko screen keeps this iframe mounted when returning to its list.
  // Treat each reopen as a new reading session, rather than reusing an old unread divider.
  const hostPanel=parentDocument()?.getElementById('sengoku-panel');
  if(hostPanel&&typeof MutationObserver==='function'){
    new MutationObserver(()=>{
      if(hostPanel.hidden||!room)return;
      requestAnimationFrame(()=>{
        if(hostPanel.hidden)return;
        const state=phase();if(!state)return;
        unreadIndex=getReadIndex(state);
        entryUnreadIndex=state.visible.length>unreadIndex+1?unreadIndex+1:-1;
        firstLoad=true;currentKey='';render();
      });
    }).observe(hostPanel,{attributes:true,attributeFilter:['hidden']});
  }
  setInterval(()=>{if(!document.hidden)render();},1000);
  setInterval(()=>{if(!document.hidden)load();},300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();load();}});
  window.addEventListener('pagehide',()=>{const state=phase();if(state&&!preview)updateReadFromViewport();});

  // Small styles only for new features. The original room's CSS and bubble geometry remain unchanged.
  const extra=document.createElement('style');extra.textContent=`
    /* Highlight only the tapped speech bubble, keeping the original LINE geometry. */
    #group-messages .sengoku-bubble.sengoku-bubble-selected{--chat-bubble-fill:#ffe1a5!important;--chat-bubble-line:#d89539!important;color:#573311!important;filter:drop-shadow(0 0 4px #d8953966);}
    html[data-persona=cyber] #group-messages .sengoku-bubble.sengoku-bubble-selected{--chat-bubble-fill:#176478!important;--chat-bubble-line:#4ee6ff!important;color:#f1fcff!important;filter:drop-shadow(0 0 5px #21cbeb88);}
    #group-messages .sengoku-bubble.sengoku-bubble-selected:focus-visible{outline:2px solid #4ee6ff;outline-offset:2px;}
    #sengoku-explanation.has-selected-bubble{border-top-color:#d89539!important;}
    html[data-persona=cyber] #sengoku-explanation.has-selected-bubble{border-top-color:#4ee6ff!important;}
    #sengoku-explanation{flex:0 0 calc(62px + env(safe-area-inset-bottom,0px))!important;height:calc(62px + env(safe-area-inset-bottom,0px))!important;max-height:none!important;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px))!important;box-sizing:border-box;overflow-y:auto;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch}
    #group-messages .sengoku-time {white-space:pre-line;line-height:1.45;text-align:center;min-width:31px}
    #group-messages .history-floating{position:sticky;top:3px;z-index:7;height:0;display:flex;justify-content:center;pointer-events:none;opacity:0;transition:opacity .2s ease}
    #group-messages .history-floating.is-visible{opacity:1}
    #group-messages .history-floating span{height:max-content;padding:3px 12px;border-radius:20px;font-size:11px;line-height:1.5;color:#fff;background:rgba(114,83,57,.7)}
    html[data-persona=cyber] #group-messages .history-floating span{background:rgba(77,111,137,.8);color:#eefaff}
    #group-messages .sengoku-date.history-day{display:flex;align-items:center;justify-content:center;min-height:26px;padding:8px 0;line-height:1.5;pointer-events:none}
    #group-messages .history-day span{padding:3px 12px;border-radius:20px;font-size:11px;font-weight:500;background:rgba(114,83,57,.25);opacity:.8}
    html[data-persona=cyber] #group-messages .history-day span{background:rgba(77,111,137,.28)}
    /* Exact structure used by original group for join / leave / invite */
    #group-messages .sengoku-system-event{clear:both;text-align:center;margin:16px 12px;color:var(--muted,#9bb7c9);font-size:11px;line-height:1.6}
    #group-messages .sengoku-system-event>span{display:inline-block;max-width:100%;padding:6px 12px;border-radius:14px;background:#8299b51c;overflow-wrap:anywhere}
    #group-messages .sengoku-system-event time{display:block;font-size:inherit;color:inherit;line-height:1.4}
    #group-messages .sengoku-system-event .group-event-label{display:block;line-height:1.5}
    /* The same quiet unread separator used by the original Himiko group chat. */
    #group-messages .sengoku-unread-divider{display:flex;align-items:center;gap:10px;margin:18px 0;padding:6px 0;font-size:11px;font-weight:normal;color:var(--text-sub,#8d705b);white-space:nowrap;animation:none}
    #group-messages .sengoku-unread-divider::before,#group-messages .sengoku-unread-divider::after{content:'';height:1px;flex:1;background:currentColor;opacity:.22}
    html[data-persona=cyber] #group-messages .sengoku-unread-divider{color:#a9c6df}
    /* Same spacer, 40px bubble, and three 7px dots as Himiko's groupTyping(). */
    #group-messages .sengoku-live-typing{pointer-events:none;margin-top:6px}
    #group-messages .sengoku-live-typing .bubble-avatar-spacer{width:33px;min-width:33px;height:33px;flex:none}
    #group-messages .sengoku-live-typing .typing{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-height:40px;padding:12px 16px;box-sizing:border-box}
    #group-messages .sengoku-live-typing .typing-dot{display:block;flex:0 0 7px;width:7px;height:7px;border-radius:50%;animation:himikoTyping 1.1s ease-in-out infinite}
    @media(prefers-reduced-motion:reduce){#group-messages .sengoku-live-typing .typing-dot{animation:none!important}}
  `;document.head.append(extra);
})();

/* Exact original Himiko chat balloon vector outline; redraw only on size/theme changes. */
(()=>{
  const selector=':is(#chat-view,#group-view) .messages :is(.bubble,.typing,.suggestion-btn)';
  function shapePath(w,h){
    const x=6.5,right=w+5.5,top=.5,bottom=h-.5,r=Math.min((h-1)/2,23.5),tailR=23.5,tip=w+11;
    return `M${x+r} ${top} H${right-tailR} C${right-tailR*.72} ${top} ${right-tailR*.5} ${top+1} ${right-9} ${top+4} C${right-4} ${top+5} ${right+1} ${top+3} ${tip} ${top+.5} C${tip-.6} ${top+5} ${right+3} ${top+9} ${right-1} ${top+12} C${right} ${top+15} ${right} ${top+17} ${right} ${top+18} V${bottom-r} A${r} ${r} 0 0 1 ${right-r} ${bottom} H${x+r} A${r} ${r} 0 0 1 ${x} ${bottom-r} V${top+r} A${r} ${r} 0 0 1 ${x+r} ${top} Z`;
  }
  function paint(el){
    const w=el.offsetWidth,h=el.offsetHeight;if(w<10||h<24)return;
    const style=getComputedStyle(el),draft=el.classList.contains('suggestion-btn'),fill=draft?'none':(style.getPropertyValue('--chat-bubble-fill').trim()||'#fff7eb'),line=style.getPropertyValue('--chat-bubble-line').trim()||'#ead2b9';
    const left=el.classList.contains('assistant')||el.classList.contains('typing'),stamp=[w,h,fill,line,left].join('|');if(el.nekoShapeStamp===stamp)return;el.nekoShapeStamp=stamp;
    const transform=left?`transform="translate(${w+12} 0) scale(-1 1)"`:'';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w+12}" height="${h}" viewBox="0 0 ${w+12} ${h}"><path ${transform} d="${shapePath(w,h)}" fill="${fill}" stroke="${line}" stroke-width="1" stroke-linejoin="round"/></svg>`;
    el.style.setProperty('--chat-bubble-shape',`url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }
  const observed=new Set(),resizer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>entries.forEach(e=>paint(e.target))):null;
  let pending=false;function scan(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;for(const el of observed){if(!el.isConnected){resizer?.unobserve(el);observed.delete(el);}}for(const el of document.querySelectorAll(selector)){paint(el);if(!observed.has(el)){observed.add(el);resizer?.observe(el);}}});}
  const app=document.body;if(app)new MutationObserver(scan).observe(app,{childList:true,subtree:true});
  new MutationObserver(scan).observe(document.documentElement,{attributes:true,attributeFilter:['data-persona']});
  window.addEventListener('sengoku-bubble-selection',()=>{
    document.querySelectorAll('#group-messages .sengoku-bubble').forEach(el=>{
      if(el.classList.contains('sengoku-bubble-selected') || el.nekoShapeStamp?.includes('#ffe1a5') || el.nekoShapeStamp?.includes('#176478'))paint(el);
    });
  });
  window.addEventListener('resize',scan,{passive:true});scan();
})();
