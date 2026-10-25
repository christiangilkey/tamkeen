"""Step 2 of the Portuguese basics course: group wordfreq's most common forms by dictionary word.

    python tools/course/pt/rank.py   ->  tools/course/build/pt-ranked.json  [[rank, word, frequency, [forms]], ...]
                                         tools/course/build/pt-ranked.txt   the same, to read

Reads tools/course/build/pt-forms.json (tools/course/forms.py pt) and the app's Portuguese word table
(docs/lexicon/pt-lemmas.json.gz: each form's dictionary word). The table gets many of the commonest words
wrong ("para" as a form of parar, "como" of comer, "nós" of nó), and has no entry for the contractions
(do = de + o, no = em + o, pelo = por + o), so FIX below says where those forms belong. A few forms are two
different words that are both very common ("se": if / oneself; "nos": in the / us); SPLIT shares their count
between the two, by a rough estimate. Numbers, letters, English words and internet abbreviations are left out.
"""

from __future__ import annotations

import gzip
import json
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
BUILD = HERE.parent / "build"

# Forms that are not Portuguese words, or not ones a course teaches as words of their own.
DROP = set("""
the to of and in for is on you it i my me with that this be at by from your are we not or have
just so all can no but one was will if like what out do up an new more get our about time love
d c s x m p n q b f g h j k l r t u v w y z
vc vcs pq tb tbm tbem msm mt mto mta hj kk kkk kkkk kkkkk rs rsrs aki eh oq td cmg blz vlw obg pfv
ex la lo los las sr sra dr dra etc
""".split())

# Where a form really belongs (the table's word for it is wrong, or it is a contraction).
FIX = {
    # prepositions and their contractions with the articles
    "do": "de", "da": "de", "dos": "de", "das": "de",
    "no": "em", "na": "em", "nas": "em", "num": "em", "numa": "em", "nuns": "em", "numas": "em",
    "ao": "a", "aos": "a", "à": "a", "às": "a",
    "pelo": "por", "pela": "por", "pelos": "por", "pelas": "por",
    "pra": "para", "pro": "para", "pras": "para", "pros": "para", "para": "para",
    # the article (feminine "a" stays with the preposition "a": see SPLIT)
    "os": "o", "as": "o",
    # pronouns and their contractions
    "nós": "nós", "dele": "dele", "dela": "dele", "deles": "dele", "delas": "dele",
    "nele": "ele", "nela": "ele", "neles": "ele", "nelas": "ele",
    "cê": "você", "ocê": "você",
    "disso": "isso", "nisso": "isso", "disto": "isto", "nisto": "isto",
    "deste": "este", "desta": "este", "destes": "este", "destas": "este",
    "neste": "este", "nesta": "este", "nestes": "este", "nestas": "este",
    "desse": "esse", "dessa": "esse", "desses": "esse", "dessas": "esse",
    "nesse": "esse", "nessa": "esse", "nesses": "esse", "nessas": "esse",
    "daquele": "aquele", "daquela": "aquele", "daqueles": "aquele", "daquelas": "aquele",
    "naquele": "aquele", "naquela": "aquele", "naqueles": "aquele", "naquelas": "aquele",
    "àquele": "aquele", "àquela": "aquele", "daquilo": "aquilo", "naquilo": "aquilo",
    "daqui": "aqui", "dali": "ali", "daí": "aí", "dalí": "ali",
    "doutro": "outro", "doutra": "outro", "noutro": "outro", "noutra": "outro",
    # words the table takes for forms of another word
    "como": "como", "entre": "entre", "antes": "antes", "sobre": "sobre", "contra": "contra",
    "durante": "durante", "segundo": "segundo", "segunda": "segundo", "fora": "fora",
    "parte": "parte", "partes": "parte", "estado": "estado", "estados": "estado",
    "política": "política", "políticas": "política", "equipe": "equipe", "equipes": "equipe",
    "deve": "dever", "devem": "dever", "devemos": "dever", "devo": "dever",
    "preciso": "precisar", "precisa": "precisar", "precisamos": "precisar", "precisam": "precisar",
    "há": "haver", "hão": "haver",
    "tá": "estar", "tô": "estar", "tava": "estar", "tamo": "estar", "tão": "tão",
    "nada": "nada", "cerca": "cerca", "logo": "logo", "meio": "meio", "pois": "pois",
    "conta": "conta", "contas": "conta", "volta": "volta", "falta": "falta",
    "ajuda": "ajuda", "causa": "causa", "causas": "causa", "uso": "uso",
    "sido": "ser", "era": "ser", "eram": "ser", "foi": "ser",
    "seja": "ser", "sejam": "ser", "fosse": "ser", "fossem": "ser", "for": "ser", "forem": "ser",
    "vamos": "ir", "vão": "ir",
    "jogo": "jogo", "jogos": "jogo", "trabalho": "trabalho", "trabalhos": "trabalho",
    "obrigado": "obrigado", "obrigada": "obrigado",
    "cara": "cara", "caras": "cara", "tipo": "tipo", "tipos": "tipo",
    "certo": "certo", "certa": "certo", "certos": "certo", "certas": "certo",
    "quanto": "quanto", "quanta": "quanto", "quantos": "quanto", "quantas": "quanto",
    "sei": "saber", "sabe": "saber",
    "todo": "todo", "toda": "todo", "todos": "todo", "todas": "todo",
    "mesmo": "mesmo", "mesma": "mesmo", "mesmos": "mesmo", "mesmas": "mesmo",
    "vários": "vários", "várias": "vários",
    "feito": "fazer", "feita": "fazer", "feitos": "fazer", "feitas": "fazer",
    "dado": "dar", "dados": "dado",
    "olha": "olhar", "olhe": "olhar",
    "vem": "vir", "vêm": "vir", "vindo": "vir", "veio": "vir",
    "fui": "ser", "foram": "ser", "fomos": "ser",
    "vi": "ver", "viu": "ver", "visto": "ver", "vista": "vista",
    "sente": "sentir", "sinto": "sentir",
    "acho": "achar", "acha": "achar",
    # nouns and adjectives the table files under a verb or another word
    "sozinho": "sozinho", "sozinha": "sozinho", "sozinhos": "sozinho", "sozinhas": "sozinho",
    "metade": "metade", "partido": "partido", "partidos": "partido", "partida": "partida", "partidas": "partida",
    "comida": "comida", "comidas": "comida", "bebê": "bebê", "bebês": "bebê", "bebida": "bebida", "bebidas": "bebida",
    "bateria": "bateria", "baterias": "bateria", "olho": "olho", "olhos": "olho",
    "marca": "marca", "marcas": "marca", "marco": "marco", "marques": "marques",
    "entrada": "entrada", "entradas": "entrada", "saída": "saída", "saídas": "saída",
    "chegada": "chegada", "pedido": "pedido", "pedidos": "pedido", "peça": "peça", "peças": "peça",
    "leste": "leste", "continha": "conter", "gosto": "gostar", "sentido": "sentido", "sentidos": "sentido",
    "encontro": "encontro", "encontros": "encontro", "corrida": "corrida", "corridas": "corrida",
    "consigo": "consigo", "contigo": "contigo", "conosco": "conosco", "connosco": "conosco",
    "tiro": "tiro", "tiros": "tiro", "luto": "lutar", "começo": "começo",
    "saudita": "saudita", "amo": "amar", "ama": "amar", "amas": "amar", "maia": "maia", "maias": "maia",
    "abaixo": "abaixo", "cuidado": "cuidado", "cuidados": "cuidado", "péssimo": "péssimo", "péssima": "péssimo",
    "péssimas": "péssimo", "péssimos": "péssimo", "grave": "grave", "graves": "grave", "vale": "valer",
    "projetos": "projeto", "ações": "ação", "atividades": "atividade", "realizado": "realizar",
    "realizada": "realizar", "realizados": "realizar", "realizadas": "realizar", "estudos": "estudo",
    "ato": "ato", "atos": "ato", "curto": "curto", "carinho": "carinho", "paris": "paris", "duro": "duro",
    "dura": "duro", "duros": "duro", "duras": "duro", "meta": "meta", "metas": "meta", "colo": "colo",
    "idéia": "ideia", "idéias": "ideia", "video": "vídeo", "videos": "vídeo", "nao": "não", "pergunta": "pergunta",
    "perguntas": "pergunta", "ótimo": "ótimo", "ótima": "ótimo", "ótimos": "ótimo", "ótimas": "ótimo",
    "última": "último", "últimas": "último", "publicado": "publicar", "publicada": "publicar",
    "publicados": "publicar", "publicadas": "publicar", "considerado": "considerar", "considerada": "considerar",
    "considerados": "considerar", "consideradas": "considerar", "utilizado": "utilizar", "utilizada": "utilizar",
    "utilizados": "utilizar", "utilizadas": "utilizar", "voto": "voto", "votos": "voto",
}

# Forms that are two different, common words: the share of the form's count each gets (a rough estimate).
SPLIT = {
    "a": {"o": 0.65, "a": 0.35},          # the (feminine) / to, at
    "se": {"se": 0.55, "se ": 0.45},      # if / oneself (the space keeps them apart; stripped when written)
    "nos": {"em": 0.6, "nos": 0.4},       # in the / us
    "são": {"ser": 0.9, "são": 0.1},      # are / healthy, saint
}

# Names of people and places, nationalities and other words a course leaves out (checked by hand).
NAMES = set("""
brasil paulo rio janeiro silva santos são_paulo portugal lisboa joão maria josé pedro lula bolsonaro
minas gerais bahia pernambuco ceará paraná goiás amazonas recife salvador fortaleza curitiba manaus
belo horizonte porto alegre brasília europa áfrica ásia américa eua estados_unidos china japão frança
alemanha espanha itália inglaterra argentina méxico rússia índia israel portugal angola moçambique
brasileiro portuguesa português americano europeu francês inglês alemão espanhol italiano chinês
cristo jesus pedro ana carlos luiz luís antónio antônio fernando marcos rafael gabriel lucas mateus
santa catarina espírito_santo flamengo corinthians palmeiras grêmio vasco fluminense botafogo cruzeiro
google facebook youtube instagram whatsapp twitter netflix globo record sbt band uol g1
""".split())


def main() -> None:
    table = json.load(gzip.open(ROOT / "docs" / "lexicon" / "pt-lemmas.json.gz", "rt", encoding="utf-8"))
    lemmas, forms = table["lemmas"], table["forms"]
    known = set(lemmas)
    rows = json.loads((BUILD / "pt-forms.json").read_text(encoding="utf-8"))
    total: dict[str, float] = defaultdict(float)
    members: dict[str, list[str]] = defaultdict(list)
    for form, freq in rows:
        if form in DROP or not re.fullmatch(r"[a-zà-öø-ÿ]+(-[a-zà-öø-ÿ]+)*", form):
            continue
        shares = SPLIT.get(form) or {FIX.get(form) or (lemmas[forms[form]] if form in forms else form): 1.0}
        for word, share in shares.items():
            total[word] += freq * share
            members[word].append(form)
    ranked = sorted(total, key=lambda w: -total[w])
    out = [[i + 1, w.strip(), total[w], members[w][:8]] for i, w in enumerate(ranked)]
    (BUILD / "pt-ranked.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    lines = []
    for r, w, f, m in out:
        notes = (["(name?)"] if w in NAMES else []) + ([] if w in known else ["(not in table)"])
        lines.append("\t".join([str(r), w, f"{f * 1e6:.1f}", " ".join(m), *notes]))
    (BUILD / "pt-ranked.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(out)} words -> {BUILD / 'pt-ranked.json'}")


if __name__ == "__main__":
    main()
