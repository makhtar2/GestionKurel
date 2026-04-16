import streamlit as st
from streamlit_gsheets import GSheetsConnection
import pandas as pd
from datetime import datetime
import plotly.express as px

# Configuration de la page
st.set_page_config(
    page_title="Kourel Manager",
    page_icon="✨",
    layout="centered" # Centré pour un look plus "App mobile" pro
)

# Style CSS personnalisé pour un look moderne et épuré
st.markdown("""
    <style>
    /* Importation d'une police plus moderne si possible */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }

    /* Style des cartes de membres */
    .member-card {
        background-color: #f8f9fa;
        border-radius: 12px;
        padding: 15px;
        margin-bottom: 10px;
        border-left: 5px solid #007bff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    /* Boutons personnalisés */
    .stButton>button {
        border-radius: 8px;
        transition: all 0.3s;
        border: none;
        background-color: #007bff;
        color: white;
    }
    
    .stButton>button:hover {
        background-color: #0056b3;
        transform: translateY(-1px);
    }
    
    /* Cacher le menu Streamlit pour faire plus "App" */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    </style>
    """, unsafe_allow_html=True)

# Connexion
conn = st.connection("gsheets", type=GSheetsConnection)

# --- Chargement des données ---
@st.cache_data(ttl=60)
def get_all_data():
    try:
        members = conn.read(worksheet="Membres", ttl="5m")["Nom"].dropna().sort_values().tolist()
    except:
        members = ["Utilisateur Test"]
    
    try:
        history = conn.read(ttl="1m")
        history['Date'] = pd.to_datetime(history['Date']).dt.date
    except:
        history = pd.DataFrame(columns=["Date", "Membre", "Statut", "Commentaire"])
        
    return members, history

MEMBRES, DF_HISTO = get_all_data()

# --- Barre latérale simplifiée ---
with st.sidebar:
    st.image("https://cdn-icons-png.flaticon.com/512/3135/3135715.png", width=100)
    st.title("Gestion Kourel")
    choice = st.radio("Aller vers :", ["🏠 Accueil", "✅ Faire l'appel", "📜 Historique"], label_visibility="collapsed")
    st.divider()
    pwd = st.text_input("🔑 Code Accès", type="password", placeholder="Entrez le code...")

# --- LOGIQUE DE NAVIGATION ---

if choice == "🏠 Accueil":
    st.title("Bonjour ! 👋")
    st.write("Voici un résumé de l'activité du groupe.")
    
    if not DF_HISTO.empty:
        # Métriques simplifiées
        c1, c2 = st.columns(2)
        total_jours = len(DF_HISTO['Date'].unique())
        c1.metric("Séances effectuées", total_jours)
        
        presences = len(DF_HISTO[DF_HISTO['Statut'].isin(["Présent", "Retard"])])
        taux = int((presences / len(DF_HISTO)) * 100)
        c2.metric("Taux de présence", f"{taux}%")
        
        st.subheader("Assiduité par membre")
        # Graphique plus propre
        stats = DF_HISTO.copy()
        stats['Score'] = stats['Statut'].apply(lambda x: 1 if x in ["Présent", "Retard"] else 0)
        m_stats = stats.groupby('Membre')['Score'].mean().reset_index()
        m_stats['Taux (%)'] = (m_stats['Score'] * 100).astype(int)
        
        fig = px.bar(m_stats, x='Taux (%)', y='Membre', orientation='h',
                     color='Taux (%)', color_continuous_scale='Greens',
                     text_auto=True)
        fig.update_layout(height=300, margin=dict(l=0, r=0, t=0, b=0), showlegend=False)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Aucune donnée pour le moment. Commencez par faire votre premier appel !")

elif choice == "✅ Faire l'appel":
    st.title("✅ Faire l'appel")
    
    if pwd == st.secrets["password"]:
        current_date = st.date_input("Date de la séance", datetime.now())
        st.write("---")
        
        # Guide pour l'utilisateur novice
        st.markdown("💡 *Tout le monde est marqué **Présent** par défaut. Changez uniquement ceux qui sont absents ou en retard.*")
        
        new_records = []
        
        # Affichage sous forme de "Cartes" pour mobile
        for m in MEMBRES:
            with st.container():
                # On utilise des colonnes pour un alignement propre
                col_name, col_action = st.columns([1, 1])
                with col_name:
                    st.markdown(f"### {m}")
                with col_action:
                    status = st.select_slider(
                        "Statut",
                        options=["Absent", "Excusé", "Retard", "Présent"],
                        value="Présent",
                        key=f"s_{m}",
                        label_visibility="collapsed"
                    )
                
                # Petit champ de note si besoin
                with st.expander("Ajouter une note..."):
                    note = st.text_input("Commentaire", key=f"n_{m}", placeholder="Ex: A prévenu tard...")
                
                new_records.append({"Date": str(current_date), "Membre": m, "Statut": status, "Commentaire": note})
                st.markdown("---")
        
        if st.button("🚀 Enregistrer l'appel de toute l'équipe", use_container_width=True):
            with st.spinner("Enregistrement sécurisé..."):
                final_df = pd.concat([DF_HISTO, pd.DataFrame(new_records)], ignore_index=True)
                conn.update(data=final_df)
                st.success("C'est fait ! L'appel a été enregistré.")
                st.balloons()
                st.cache_data.clear()
    else:
        st.warning("🔒 Veuillez entrer le code d'accès dans la barre latérale pour continuer.")

elif choice == "📜 Historique":
    st.title("📜 Historique")
    
    if not DF_HISTO.empty:
        # Filtre simple
        search = st.text_input("🔍 Rechercher un nom...", placeholder="Tapez un nom ici...")
        
        display_df = DF_HISTO.copy()
        if search:
            display_df = display_df[display_df['Membre'].str.contains(search, case=False)]
            
        # Affichage élégant
        st.dataframe(
            display_df.sort_values("Date", ascending=False),
            use_container_width=True,
            column_config={
                "Date": st.column_config.DateColumn("Date"),
                "Statut": st.column_config.TextColumn("Statut"),
                "Membre": st.column_config.TextColumn("Nom du Membre")
            }
        )
    else:
        st.info("L'historique est vide.")
